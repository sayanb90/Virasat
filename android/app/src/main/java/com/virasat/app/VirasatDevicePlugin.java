package com.virasat.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.security.keystore.KeyProperties;
import android.security.keystore.StrongBoxUnavailableException;
import android.util.Base64;

import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.Key;
import java.security.KeyFactory;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.Signature;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.MGF1ParameterSpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.OAEPParameterSpec;
import javax.crypto.spec.PSource;

/**
 * Virasat - This phone's keys, behind Android Keystore (lib/device/native.ts is
 * the JavaScript side, and documents the formats).
 *
 * Three kinds of key, all generated inside Keystore (StrongBox when the phone
 * has one) so the private halves never reach this process:
 *
 *   signing     EC P-256, no user authentication. Proves the phone on the PIN path.
 *   biometric   EC P-256, BIOMETRIC_STRONG, valid for a few seconds after the prompt.
 *   wrap        RSA-2048 OAEP, the same gate. Its public half wraps K_vault at
 *               enrolment without a prompt; only the private half needs one.
 *
 * One prompt for both biometric keys: a BiometricPrompt can carry only one
 * CryptoObject, so the two keys are time-bound instead of per-use, and the
 * prompt is shown without one. A successful BIOMETRIC_STRONG prompt unlocks
 * every such key for AUTH_VALIDITY_SECONDS. Biometric enrolment needs Android
 * 11 (API 30): before it, a time-bound key also opens with the screen lock and
 * survives a new fingerprint, which is not the guarantee Virasat makes. Older
 * phones use the PIN.
 *
 * Adding a fingerprint or face invalidates the biometric keys, and Keystore
 * throws KeyPermanentlyInvalidatedException. That is reported as
 * BIOMETRICS_CHANGED, and the app falls back to the PIN.
 */
@CapacitorPlugin(name = "VirasatDevice")
public class VirasatDevicePlugin extends Plugin {

    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String PREFS = "virasat.device";
    private static final String STORAGE_KEY_ALIAS = "virasat.storage";
    private static final int AUTH_VALIDITY_SECONDS = 10;
    private static final int GCM_IV_BYTES = 12;
    private static final int GCM_TAG_BITS = 128;
    private static final String RSA_OAEP = "RSA/ECB/OAEPWithSHA-256AndMGF1Padding";
    // Keystore's OAEP supports MGF1 with SHA-1 only, so both sides say so explicitly.
    private static final OAEPParameterSpec OAEP_SPEC =
        new OAEPParameterSpec("SHA-256", "MGF1", MGF1ParameterSpec.SHA1, PSource.PSpecified.DEFAULT);

    private static final String BIOMETRICS_CHANGED = "BIOMETRICS_CHANGED";
    private static final String BIOMETRY_LOCKED = "BIOMETRY_LOCKED";

    private final Executor background = Executors.newSingleThreadExecutor();

    /* ------------------------------------------------------------------ */
    /* Biometrics                                                         */
    /* ------------------------------------------------------------------ */

    private boolean canUseBiometrics() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return false;
        return BiometricManager.from(getContext()).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)
            == BiometricManager.BIOMETRIC_SUCCESS;
    }

    @PluginMethod
    public void biometry(PluginCall call) {
        PackageManager pm = getContext().getPackageManager();
        boolean fingerprint = pm.hasSystemFeature(PackageManager.FEATURE_FINGERPRINT);
        boolean face = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && pm.hasSystemFeature(PackageManager.FEATURE_FACE);
        String kind = fingerprint && !face ? "fingerprint" : face && !fingerprint ? "face" : "biometric";
        boolean available = canUseBiometrics();
        JSObject result = new JSObject();
        result.put("available", available);
        result.put("kind", available ? kind : "none");
        call.resolve(result);
    }

    private interface PromptOutcome {
        void succeeded();
        void cancelled();
    }

    /** Shows the system prompt. BiometricPrompt must be built and shown on the main thread. */
    private void prompt(PluginCall call, String reason, PromptOutcome outcome) {
        getActivity().runOnUiThread(() -> {
            BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                .setTitle("Virasat")
                .setSubtitle(reason)
                .setNegativeButtonText("Use PIN")
                .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                .build();
            BiometricPrompt biometricPrompt = new BiometricPrompt(
                getActivity(),
                ContextCompat.getMainExecutor(getContext()),
                new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                        background.execute(outcome::succeeded);
                    }

                    @Override
                    public void onAuthenticationError(int code, @NonNull CharSequence message) {
                        switch (code) {
                            case BiometricPrompt.ERROR_NEGATIVE_BUTTON:
                            case BiometricPrompt.ERROR_USER_CANCELED:
                            case BiometricPrompt.ERROR_CANCELED:
                                outcome.cancelled();
                                break;
                            case BiometricPrompt.ERROR_LOCKOUT:
                            case BiometricPrompt.ERROR_LOCKOUT_PERMANENT:
                                call.reject("Too many attempts. Please use your PIN.", BIOMETRY_LOCKED);
                                break;
                            default:
                                call.reject(message.toString(), "BIOMETRY_ERROR");
                        }
                    }
                    // onAuthenticationFailed: one face or finger not recognised.
                    // The prompt stays up and lets the person try again.
                }
            );
            biometricPrompt.authenticate(info);
        });
    }

    @PluginMethod
    public void authenticate(PluginCall call) {
        String reason = call.getString("reason", "Confirm it is you");
        prompt(call, reason, new PromptOutcome() {
            public void succeeded() {
                call.resolve(promptResult(false));
            }

            public void cancelled() {
                call.resolve(promptResult(true));
            }
        });
    }

    private static JSObject promptResult(boolean cancelled) {
        JSObject result = new JSObject();
        result.put("cancelled", cancelled);
        return result;
    }

    /* ------------------------------------------------------------------ */
    /* Keys                                                               */
    /* ------------------------------------------------------------------ */

    private static KeyStore keyStore() throws Exception {
        KeyStore ks = KeyStore.getInstance(KEYSTORE);
        ks.load(null);
        return ks;
    }

    private boolean hasStrongBox() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
            && getContext().getPackageManager().hasSystemFeature(PackageManager.FEATURE_STRONGBOX_KEYSTORE);
    }

    private KeyGenParameterSpec.Builder gate(KeyGenParameterSpec.Builder builder, boolean biometric) {
        if (biometric) {
            builder.setUserAuthenticationRequired(true);
            builder.setInvalidatedByBiometricEnrollment(true);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                builder.setUserAuthenticationParameters(AUTH_VALIDITY_SECONDS, KeyProperties.AUTH_BIOMETRIC_STRONG);
            }
        }
        return builder;
    }

    private KeyGenParameterSpec.Builder spec(String alias, String purpose, boolean biometric) {
        KeyGenParameterSpec.Builder builder;
        if ("sign".equals(purpose)) {
            builder = new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN)
                .setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1"))
                .setDigests(KeyProperties.DIGEST_SHA256);
        } else {
            builder = new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setKeySize(2048)
                .setDigests(KeyProperties.DIGEST_SHA256)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_RSA_OAEP);
        }
        return gate(builder, biometric);
    }

    private PublicKey generate(String alias, String purpose, boolean biometric) throws Exception {
        String algorithm = "sign".equals(purpose) ? KeyProperties.KEY_ALGORITHM_EC : KeyProperties.KEY_ALGORITHM_RSA;
        if (hasStrongBox()) {
            try {
                KeyPairGenerator generator = KeyPairGenerator.getInstance(algorithm, KEYSTORE);
                generator.initialize(spec(alias, purpose, biometric).setIsStrongBoxBacked(true).build());
                return generator.generateKeyPair().getPublic();
            } catch (StrongBoxUnavailableException e) {
                // Advertised but busy or unsupported for this key: the TEE is next best.
            }
        }
        KeyPairGenerator generator = KeyPairGenerator.getInstance(algorithm, KEYSTORE);
        generator.initialize(spec(alias, purpose, biometric).build());
        return generator.generateKeyPair().getPublic();
    }

    /** A big-endian unsigned integer in exactly `size` bytes. */
    private static byte[] fixed(BigInteger value, int size) {
        byte[] bytes = value.toByteArray();
        byte[] out = new byte[size];
        int copy = Math.min(bytes.length, size);
        System.arraycopy(bytes, bytes.length - copy, out, size - copy, copy);
        return out;
    }

    /** 04 ‖ x ‖ y, the same shape iOS returns. */
    private static byte[] uncompressedPoint(ECPublicKey key) {
        byte[] out = new byte[65];
        out[0] = 0x04;
        System.arraycopy(fixed(key.getW().getAffineX(), 32), 0, out, 1, 32);
        System.arraycopy(fixed(key.getW().getAffineY(), 32), 0, out, 33, 32);
        return out;
    }

    @PluginMethod
    public void createKey(PluginCall call) {
        String alias = call.getString("alias");
        String purpose = call.getString("purpose");
        boolean biometric = Boolean.TRUE.equals(call.getBoolean("biometric", false));
        if (alias == null || purpose == null) {
            call.reject("alias and purpose are required");
            return;
        }
        if (biometric && !canUseBiometrics()) {
            call.reject("This phone cannot use biometrics for Virasat.", "BIOMETRY_UNAVAILABLE");
            return;
        }
        try {
            PublicKey publicKey = generate(alias, purpose, biometric);
            JSObject result = new JSObject();
            result.put("publicKey", publicKey instanceof ECPublicKey
                ? b64(uncompressedPoint((ECPublicKey) publicKey))
                : "");
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Could not create a key on this phone.", "KEY_ERROR", e);
        }
    }

    private static PrivateKey privateKey(String alias) throws Exception {
        Key key = keyStore().getKey(alias, null);
        if (!(key instanceof PrivateKey)) throw new KeyMissingException();
        return (PrivateKey) key;
    }

    /** The key is gone: deleted, or removed by Keystore after a biometric change. */
    private static class KeyMissingException extends Exception {}

    private static byte[] signWith(PrivateKey key, byte[] data) throws Exception {
        Signature signature = Signature.getInstance("SHA256withECDSA");
        signature.initSign(key);
        signature.update(data);
        return signature.sign(); // DER; lib/device/der.ts converts it
    }

    @PluginMethod
    public void sign(PluginCall call) {
        try {
            byte[] signature = signWith(privateKey(call.getString("alias")), unb64(call.getString("data")));
            JSObject result = new JSObject();
            result.put("signature", b64(signature));
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Could not sign on this phone.", "KEY_ERROR", e);
        }
    }

    @PluginMethod
    public void wrap(PluginCall call) {
        try {
            java.security.cert.Certificate cert = keyStore().getCertificate(call.getString("alias"));
            if (cert == null) throw new KeyMissingException();
            // Encrypt with a plain copy of the public key, in the default
            // provider: public-key operations need no authentication.
            PublicKey publicKey = KeyFactory.getInstance("RSA")
                .generatePublic(new X509EncodedKeySpec(cert.getPublicKey().getEncoded()));
            Cipher cipher = Cipher.getInstance(RSA_OAEP);
            cipher.init(Cipher.ENCRYPT_MODE, publicKey, OAEP_SPEC);
            JSObject result = new JSObject();
            result.put("ciphertext", b64(cipher.doFinal(unb64(call.getString("data")))));
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Could not protect the key on this phone.", "KEY_ERROR", e);
        }
    }

    @PluginMethod
    public void biometricUnlock(PluginCall call) {
        String signAlias = call.getString("signAlias");
        String wrapAlias = call.getString("wrapAlias");
        byte[] data = unb64(call.getString("data"));
        byte[] ciphertext = unb64(call.getString("ciphertext"));
        String reason = call.getString("reason", "Open your notes");

        // Find out before the prompt whether the keys still exist, so nobody
        // is asked for a fingerprint that cannot open anything.
        try {
            privateKey(signAlias);
            privateKey(wrapAlias);
            Signature probe = Signature.getInstance("SHA256withECDSA");
            probe.initSign(privateKey(signAlias));
        } catch (KeyPermanentlyInvalidatedException | KeyMissingException e) {
            call.reject("Biometrics have changed on this phone.", BIOMETRICS_CHANGED, e);
            return;
        } catch (android.security.keystore.UserNotAuthenticatedException e) {
            // Expected: the key is fine, and is waiting for the prompt.
        } catch (Exception e) {
            call.reject("Could not reach this phone's keys.", "KEY_ERROR", e);
            return;
        }

        prompt(call, reason, new PromptOutcome() {
            public void succeeded() {
                try {
                    byte[] signature = signWith(privateKey(signAlias), data);
                    Cipher cipher = Cipher.getInstance(RSA_OAEP);
                    cipher.init(Cipher.DECRYPT_MODE, privateKey(wrapAlias), OAEP_SPEC);
                    byte[] plaintext = cipher.doFinal(ciphertext);
                    JSObject result = promptResult(false);
                    result.put("signature", b64(signature));
                    result.put("plaintext", b64(plaintext));
                    call.resolve(result);
                } catch (KeyPermanentlyInvalidatedException | KeyMissingException e) {
                    call.reject("Biometrics have changed on this phone.", BIOMETRICS_CHANGED, e);
                } catch (Exception e) {
                    call.reject("Could not open your notes on this phone.", "KEY_ERROR", e);
                }
            }

            public void cancelled() {
                call.resolve(promptResult(true));
            }
        });
    }

    @PluginMethod
    public void deleteKeys(PluginCall call) {
        try {
            KeyStore ks = keyStore();
            JSArray aliases = call.getArray("aliases", new JSArray());
            for (int i = 0; i < aliases.length(); i++) {
                String alias = aliases.getString(i);
                if (ks.containsAlias(alias)) ks.deleteEntry(alias);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not delete keys.", "KEY_ERROR", e);
        }
    }

    /* ------------------------------------------------------------------ */
    /* Storage: SharedPreferences, each value AES-GCM encrypted with a    */
    /* Keystore key that needs no authentication. Backups are off (see    */
    /* AndroidManifest.xml); if a value cannot be decrypted, it is gone.  */
    /* ------------------------------------------------------------------ */

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static SecretKey storageKey() throws Exception {
        KeyStore ks = keyStore();
        Key existing = ks.getKey(STORAGE_KEY_ALIAS, null);
        if (existing instanceof SecretKey) return (SecretKey) existing;
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        generator.init(new KeyGenParameterSpec.Builder(STORAGE_KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build());
        return generator.generateKey();
    }

    @PluginMethod
    public void getItem(PluginCall call) {
        String key = call.getString("key");
        String stored = prefs().getString(key, null);
        JSObject result = new JSObject();
        if (stored == null) {
            result.put("value", JSObject.NULL);
            call.resolve(result);
            return;
        }
        try {
            byte[] blob = unb64(stored);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, storageKey(), new GCMParameterSpec(GCM_TAG_BITS, blob, 0, GCM_IV_BYTES));
            byte[] plain = cipher.doFinal(blob, GCM_IV_BYTES, blob.length - GCM_IV_BYTES);
            result.put("value", new String(plain, StandardCharsets.UTF_8));
        } catch (Exception e) {
            // Written under a key this install does not have. Treat as never written.
            prefs().edit().remove(key).apply();
            result.put("value", JSObject.NULL);
        }
        call.resolve(result);
    }

    @PluginMethod
    public void setItem(PluginCall call) {
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, storageKey());
            byte[] iv = cipher.getIV();
            byte[] sealed = cipher.doFinal(call.getString("value", "").getBytes(StandardCharsets.UTF_8));
            byte[] blob = new byte[iv.length + sealed.length];
            System.arraycopy(iv, 0, blob, 0, iv.length);
            System.arraycopy(sealed, 0, blob, iv.length, sealed.length);
            // commit, not apply: the app may be killed right after a sign-in.
            prefs().edit().putString(call.getString("key"), b64(blob)).commit();
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not save on this phone.", "STORAGE_ERROR", e);
        }
    }

    @PluginMethod
    public void removeItem(PluginCall call) {
        prefs().edit().remove(call.getString("key")).commit();
        call.resolve();
    }

    @PluginMethod
    public void deviceName(PluginCall call) {
        JSObject result = new JSObject();
        String maker = Build.MANUFACTURER == null ? "" : Build.MANUFACTURER;
        String model = Build.MODEL == null ? "Android phone" : Build.MODEL;
        String name = model.toLowerCase().startsWith(maker.toLowerCase()) ? model : (maker + " " + model).trim();
        result.put("name", name.isEmpty() ? "Android phone" : name.substring(0, 1).toUpperCase() + name.substring(1));
        call.resolve(result);
    }

    private static String b64(byte[] bytes) {
        return Base64.encodeToString(bytes, Base64.NO_WRAP);
    }

    private static byte[] unb64(String value) {
        return Base64.decode(value == null ? "" : value, Base64.DEFAULT);
    }
}
