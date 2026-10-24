import Foundation
import Capacitor
import LocalAuthentication
import Security
import UIKit

/// Virasat - This phone's keys, in the Secure Enclave (lib/device/native.ts is
/// the JavaScript side, and documents the formats).
///
/// Every key is a P-256 key generated inside the Secure Enclave, so its
/// private half never exists outside it:
///
///   signing     no biometric gate. Proves the phone on the PIN path.
///   biometric   .biometryCurrentSet. Proves Face ID to the server.
///   wrap        .biometryCurrentSet. Its public half wraps K_vault (ECIES)
///               at enrolment without a prompt; decrypting needs Face ID.
///
/// One Face ID prompt opens both biometric keys: the LAContext that
/// evaluated the policy is handed to both key lookups, and a context that
/// has already authenticated does not ask again.
///
/// .biometryCurrentSet means adding or removing a face or finger destroys the
/// biometric keys. Their absence after a successful prompt is reported as
/// BIOMETRICS_CHANGED, and the app falls back to the PIN.
///
/// Everything else (this phone's saved state, the refresh token) is a
/// Keychain item readable only while the phone is unlocked, and never synced
/// or restored to another device.
@objc(VirasatDevicePlugin)
public class VirasatDevicePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "VirasatDevicePlugin"
    public let jsName = "VirasatDevice"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "biometry", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "createKey", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sign", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "wrap", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "biometricUnlock", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteKeys", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getItem", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setItem", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "removeItem", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deviceName", returnType: CAPPluginReturnPromise)
    ]

    private static let service = "com.virasat.app.device"
    private static let tagPrefix = "com.virasat.app.key."
    private static let installedFlag = "virasat.installed"
    private static let wrapAlgorithm = SecKeyAlgorithm.eciesEncryptionCofactorVariableIVX963SHA256AESGCM
    private static let signAlgorithm = SecKeyAlgorithm.ecdsaSignatureMessageX962SHA256

    private let queue = DispatchQueue(label: "com.virasat.app.device", qos: .userInitiated)

    override public func load() {
        // Keychain items and Secure Enclave keys outlive an uninstall;
        // UserDefaults do not. A fresh install must not find a previous
        // install's sign-in and keys, so clear them on first launch.
        if !UserDefaults.standard.bool(forKey: Self.installedFlag) {
            deleteAll(kSecClassGenericPassword, [kSecAttrService as String: Self.service])
            deleteAll(kSecClassKey, [:], tagPrefix: Self.tagPrefix)
            UserDefaults.standard.set(true, forKey: Self.installedFlag)
        }
    }

    // MARK: - Biometrics

    @objc func biometry(_ call: CAPPluginCall) {
        let context = LAContext()
        var error: NSError?
        let available = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
        var kind = "none"
        switch context.biometryType {
        case .faceID: kind = "faceId"
        case .touchID: kind = "touchId"
        default:
            if #available(iOS 17.0, *), context.biometryType == .opticID { kind = "opticId" }
        }
        call.resolve(["available": available, "kind": available ? kind : "none"])
    }

    /// Shows Face ID. `completion(true)` on success, `false` if the person
    /// chose the PIN or cancelled. Other failures reject the call.
    private func evaluate(_ context: LAContext, reason: String, call: CAPPluginCall, completion: @escaping (Bool) -> Void) {
        context.localizedFallbackTitle = "Use PIN"
        context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason) { success, error in
            if success { return completion(true) }
            switch (error as? LAError)?.code {
            case .userCancel?, .appCancel?, .systemCancel?, .userFallback?:
                completion(false)
            case .biometryLockout?:
                call.reject("Too many attempts. Please use your PIN.", "BIOMETRY_LOCKED")
            default:
                call.reject(error?.localizedDescription ?? "Face ID did not work.", "BIOMETRY_ERROR")
            }
        }
    }

    @objc func authenticate(_ call: CAPPluginCall) {
        let reason = call.getString("reason") ?? "Confirm it is you"
        evaluate(LAContext(), reason: reason, call: call) { ok in
            call.resolve(["cancelled": !ok])
        }
    }

    // MARK: - Keys

    private static func tag(_ alias: String) -> Data {
        return Data((tagPrefix + alias).utf8)
    }

    private func createSecureEnclaveKey(alias: String, biometric: Bool) throws -> SecKey {
        var flags: SecAccessControlCreateFlags = [.privateKeyUsage]
        if biometric { flags.insert(.biometryCurrentSet) }
        var cfError: Unmanaged<CFError>?
        guard let access = SecAccessControlCreateWithFlags(
            kCFAllocatorDefault, kSecAttrAccessibleWhenUnlockedThisDeviceOnly, flags, &cfError
        ) else {
            throw cfError!.takeRetainedValue() as Error
        }
        var attributes: [String: Any] = [
            kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
            kSecAttrKeySizeInBits as String: 256,
            kSecPrivateKeyAttrs as String: [
                kSecAttrIsPermanent as String: true,
                kSecAttrApplicationTag as String: Self.tag(alias),
                kSecAttrAccessControl as String: access
            ] as [String: Any]
        ]
        #if !targetEnvironment(simulator)
        attributes[kSecAttrTokenID as String] = kSecAttrTokenIDSecureEnclave
        #else
        // The Simulator's Secure Enclave support depends on the Mac it runs
        // on. Use it when it is there; on a real phone there is no fallback.
        attributes[kSecAttrTokenID as String] = kSecAttrTokenIDSecureEnclave
        if let key = SecKeyCreateRandomKey(attributes as CFDictionary, nil) { return key }
        attributes.removeValue(forKey: kSecAttrTokenID as String)
        #endif
        guard let key = SecKeyCreateRandomKey(attributes as CFDictionary, &cfError) else {
            throw cfError!.takeRetainedValue() as Error
        }
        return key
    }

    @objc func createKey(_ call: CAPPluginCall) {
        guard let alias = call.getString("alias") else { return call.reject("alias is required") }
        let biometric = call.getBool("biometric") ?? false
        queue.async {
            do {
                self.removeKeys([alias])
                let privateKey = try self.createSecureEnclaveKey(alias: alias, biometric: biometric)
                guard let publicKey = SecKeyCopyPublicKey(privateKey),
                      let point = SecKeyCopyExternalRepresentation(publicKey, nil) as Data? else {
                    return call.reject("Could not read the new key.", "KEY_ERROR")
                }
                // X9.63: 04 ‖ x ‖ y, which native.ts turns into a JWK.
                call.resolve(["publicKey": point.base64EncodedString()])
            } catch {
                call.reject("Could not create a key on this phone.", "KEY_ERROR", error)
            }
        }
    }

    private enum KeyLookup {
        case found(SecKey)
        case missing
        case failed(OSStatus)
    }

    private func lookUp(_ alias: String, context: LAContext? = nil) -> KeyLookup {
        var query: [String: Any] = [
            kSecClass as String: kSecClassKey,
            kSecAttrApplicationTag as String: Self.tag(alias),
            kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
            kSecReturnRef as String: true
        ]
        if let context = context { query[kSecUseAuthenticationContext as String] = context }
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound { return .missing }
        guard status == errSecSuccess, let found = item else { return .failed(status) }
        // SecItemCopyMatching with kSecReturnRef for kSecClassKey yields a SecKey.
        return .found(found as! SecKey) // swiftlint:disable:this force_cast
    }

    private func signature(_ key: SecKey, _ data: Data) throws -> Data {
        var cfError: Unmanaged<CFError>?
        guard let signature = SecKeyCreateSignature(key, Self.signAlgorithm, data as CFData, &cfError) as Data? else {
            throw cfError!.takeRetainedValue() as Error
        }
        return signature // DER; lib/device/der.ts converts it
    }

    @objc func sign(_ call: CAPPluginCall) {
        guard let alias = call.getString("alias"),
              let data = Data(base64Encoded: call.getString("data") ?? "") else {
            return call.reject("alias and data are required")
        }
        queue.async {
            guard case .found(let key) = self.lookUp(alias) else {
                return call.reject("This phone's key is missing.", "KEY_ERROR")
            }
            do {
                call.resolve(["signature": try self.signature(key, data).base64EncodedString()])
            } catch {
                call.reject("Could not sign on this phone.", "KEY_ERROR", error)
            }
        }
    }

    @objc func wrap(_ call: CAPPluginCall) {
        guard let alias = call.getString("alias"),
              let data = Data(base64Encoded: call.getString("data") ?? "") else {
            return call.reject("alias and data are required")
        }
        queue.async {
            // Only the public half is used, and reading a key reference
            // never asks for Face ID.
            guard case .found(let privateKey) = self.lookUp(alias),
                  let publicKey = SecKeyCopyPublicKey(privateKey),
                  SecKeyIsAlgorithmSupported(publicKey, .encrypt, Self.wrapAlgorithm) else {
                return call.reject("This phone's key is missing.", "KEY_ERROR")
            }
            var cfError: Unmanaged<CFError>?
            guard let sealed = SecKeyCreateEncryptedData(publicKey, Self.wrapAlgorithm, data as CFData, &cfError) as Data? else {
                return call.reject("Could not protect the key on this phone.", "KEY_ERROR", cfError?.takeRetainedValue() as Error?)
            }
            call.resolve(["ciphertext": sealed.base64EncodedString()])
        }
    }

    @objc func biometricUnlock(_ call: CAPPluginCall) {
        guard let signAlias = call.getString("signAlias"),
              let wrapAlias = call.getString("wrapAlias"),
              let data = Data(base64Encoded: call.getString("data") ?? ""),
              let sealed = Data(base64Encoded: call.getString("ciphertext") ?? "") else {
            return call.reject("signAlias, wrapAlias, data and ciphertext are required")
        }
        let reason = call.getString("reason") ?? "Open your notes"
        let context = LAContext()
        evaluate(context, reason: reason, call: call) { ok in
            guard ok else { return call.resolve(["cancelled": true]) }
            self.queue.async {
                guard case .found(let signKey) = self.lookUp(signAlias, context: context),
                      case .found(let wrapKey) = self.lookUp(wrapAlias, context: context) else {
                    // Face ID worked, so the keys are gone because the faces changed.
                    return call.reject("Biometrics have changed on this phone.", "BIOMETRICS_CHANGED")
                }
                do {
                    let signed = try self.signature(signKey, data)
                    var cfError: Unmanaged<CFError>?
                    guard let plaintext = SecKeyCreateDecryptedData(wrapKey, Self.wrapAlgorithm, sealed as CFData, &cfError) as Data? else {
                        throw cfError!.takeRetainedValue() as Error
                    }
                    call.resolve([
                        "cancelled": false,
                        "signature": signed.base64EncodedString(),
                        "plaintext": plaintext.base64EncodedString()
                    ])
                } catch {
                    let code = (error as NSError).code
                    if code == Int(errSecAuthFailed) || code == Int(errSecItemNotFound) {
                        call.reject("Biometrics have changed on this phone.", "BIOMETRICS_CHANGED", error)
                    } else {
                        call.reject("Could not open your notes on this phone.", "KEY_ERROR", error)
                    }
                }
            }
        }
    }

    private func removeKeys(_ aliases: [String]) {
        for alias in aliases {
            let query: [String: Any] = [
                kSecClass as String: kSecClassKey,
                kSecAttrApplicationTag as String: Self.tag(alias)
            ]
            SecItemDelete(query as CFDictionary)
        }
    }

    @objc func deleteKeys(_ call: CAPPluginCall) {
        let aliases = (call.getArray("aliases") ?? []).compactMap { $0 as? String }
        queue.async {
            self.removeKeys(aliases)
            call.resolve()
        }
    }

    // MARK: - Storage

    private func itemQuery(_ key: String) -> [String: Any] {
        return [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.service,
            kSecAttrAccount as String: key
        ]
    }

    @objc func getItem(_ call: CAPPluginCall) {
        guard let key = call.getString("key") else { return call.reject("key is required") }
        queue.async {
            var query = self.itemQuery(key)
            query[kSecReturnData as String] = true
            query[kSecMatchLimit as String] = kSecMatchLimitOne
            var item: CFTypeRef?
            let status = SecItemCopyMatching(query as CFDictionary, &item)
            if status == errSecSuccess, let data = item as? Data, let value = String(data: data, encoding: .utf8) {
                call.resolve(["value": value])
            } else if status == errSecItemNotFound || status == errSecSuccess {
                call.resolve(["value": NSNull()])
            } else {
                call.reject("Could not read from this phone.", "STORAGE_ERROR")
            }
        }
    }

    @objc func setItem(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), let value = call.getString("value") else {
            return call.reject("key and value are required")
        }
        queue.async {
            SecItemDelete(self.itemQuery(key) as CFDictionary)
            var item = self.itemQuery(key)
            item[kSecValueData as String] = Data(value.utf8)
            item[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
            let status = SecItemAdd(item as CFDictionary, nil)
            if status == errSecSuccess { call.resolve() } else { call.reject("Could not save on this phone.", "STORAGE_ERROR") }
        }
    }

    @objc func removeItem(_ call: CAPPluginCall) {
        guard let key = call.getString("key") else { return call.reject("key is required") }
        queue.async {
            SecItemDelete(self.itemQuery(key) as CFDictionary)
            call.resolve()
        }
    }

    @objc func deviceName(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(["name": UIDevice.current.name])
        }
    }

    /// Deletes every item of a class matching `match`; for keys, only those
    /// whose tag starts with `tagPrefix` (the Keychain cannot match a prefix).
    private func deleteAll(_ itemClass: CFString, _ match: [String: Any], tagPrefix: String? = nil) {
        guard let prefix = tagPrefix else {
            var query = match
            query[kSecClass as String] = itemClass
            SecItemDelete(query as CFDictionary)
            return
        }
        let query: [String: Any] = [
            kSecClass as String: itemClass,
            kSecReturnAttributes as String: true,
            kSecMatchLimit as String: kSecMatchLimitAll
        ]
        var items: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &items) == errSecSuccess,
              let found = items as? [[String: Any]] else { return }
        for attributes in found {
            guard let tag = attributes[kSecAttrApplicationTag as String] as? Data,
                  String(data: tag, encoding: .utf8)?.hasPrefix(prefix) == true else { continue }
            let match: [String: Any] = [kSecClass as String: itemClass, kSecAttrApplicationTag as String: tag]
            SecItemDelete(match as CFDictionary)
        }
    }
}
