"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MailCheck, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { BottomBar } from "@/components/ui/BottomBar";
import { DigitsField, ErrorText, Field, Heading, INPUT, messageOf, passwordProblem } from "@/components/auth/Fields";
import { SocialButtons } from "@/components/auth/SocialButtons";
import { DeviceUnlock } from "@/components/auth/DeviceUnlock";
import { SetUpPhone } from "@/components/auth/SetUpPhone";
import { RecoveryKit } from "@/components/auth/RecoveryKit";
import {
  finishSignUp,
  getAuthState,
  resendCode,
  signInWithPassword,
  startSignUp,
  submitCode,
  verifySignUpCode,
  useAuth,
  type SocialResult,
} from "@/lib/auth/client";
import { markKitPending } from "@/lib/auth/kitReminder";

/**
 * Signing in and signing up (docs/authentication.md §3).
 *
 *   new:       email → code → name + password → Face ID / PIN → Recovery Kit
 *   existing:  email + password → Face ID / PIN   (or, on a new phone: code → Face ID / PIN)
 *   social:    provider → (new) password → Face ID / PIN → Recovery Kit
 *                       → (known, this phone) Face ID / PIN
 *                       → (known, new phone) password → code → Face ID / PIN
 */
type Step =
  | { k: "choose" }
  | { k: "new-email"; socialTicket?: string; name?: string; email?: string }
  | { k: "new-code"; email: string; socialTicket?: string; name?: string }
  | { k: "new-details"; signupTicket: string; email: string; name?: string; viaProvider?: boolean }
  | { k: "existing"; email?: string; linkTicket?: string; notice?: string }
  | { k: "code" }
  | { k: "device" }
  | { k: "setup"; kit?: { code: string; email: string } }
  | { k: "kit"; code: string; email: string };

export default function SignInPage() {
  // useSearchParams needs a Suspense boundary to prerender (Next 16).
  return (
    <Suspense fallback={null}>
      <SignInFlow />
    </Suspense>
  );
}

function SignInFlow() {
  const router = useRouter();
  // "Sign in with my password" from the unlock screen lands here directly.
  const startExisting = useSearchParams().get("existing") !== null;
  const [step, setStep] = useState<Step>(startExisting ? { k: "existing" } : { k: "choose" });

  const done = () => router.replace("/notes");

  const onSocial = (r: SocialResult) => {
    switch (r.status) {
      case "signed-in":
        setStep({ k: "device" });
        break;
      case "password-required":
        setStep({
          k: "existing",
          email: r.email,
          notice: "This phone has not been set up for Virasat yet. Please enter your password once.",
        });
        break;
      case "link-required":
        setStep({
          k: "existing",
          email: r.email,
          linkTicket: r.linkTicket,
          notice: "You already have a Virasat account with this email. Enter your password to connect it.",
        });
        break;
      case "signup":
        if (r.emailVerified && r.email) {
          setStep({ k: "new-details", signupTicket: r.signupTicket, email: r.email, name: r.name ?? "", viaProvider: true });
        } else {
          setStep({ k: "new-email", socialTicket: r.signupTicket, name: r.name ?? "", email: r.email ?? "" });
        }
        break;
    }
  };

  switch (step.k) {
    case "choose":
      return <Choose onNew={() => setStep({ k: "new-email" })} onExisting={() => setStep({ k: "existing" })} onSocial={onSocial} />;
    case "new-email":
      return (
        <NewEmail
          initial={step.email}
          onSent={(email) => setStep({ k: "new-code", email, socialTicket: step.socialTicket, name: step.name })}
          onBack={() => setStep({ k: "choose" })}
        />
      );
    case "new-code":
      return (
        <NewCode
          email={step.email}
          socialTicket={step.socialTicket}
          onVerified={(signupTicket) =>
            setStep({ k: "new-details", signupTicket, email: step.email, name: step.name })
          }
          onBack={() => setStep({ k: "new-email" })}
        />
      );
    case "new-details":
      return (
        <NewDetails
          {...step}
          onCreated={(kitCode) => setStep({ k: "setup", kit: { code: kitCode, email: step.email } })}
        />
      );
    case "existing":
      return (
        <Existing
          {...step}
          onNext={(needs) => setStep(needs.includes("device") ? { k: "device" } : { k: "code" })}
          onBack={() => setStep({ k: "choose" })}
        />
      );
    case "code":
      return <NewPhoneCode onVerified={() => setStep({ k: "setup" })} />;
    case "device":
      return (
        <Screen>
          <Heading title="Confirm it is you" body="Look at your phone, or enter your PIN." />
          <DeviceUnlock onDone={done} />
        </Screen>
      );
    case "setup":
      return (
        <Screen>
          <SetUpPhone onDone={() => (step.kit ? setStep({ k: "kit", ...step.kit }) : done())} />
        </Screen>
      );
    case "kit":
      return (
        <Screen>
          <RecoveryKit
            code={step.code}
            email={step.email}
            onDone={done}
            onLater={() => {
              markKitPending();
              done();
            }}
          />
        </Screen>
      );
  }
}

function Screen({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 flex-col pb-8">{children}</div>;
}

/* ---------------------------------------------------------------------- */

function Choose({
  onNew,
  onExisting,
  onSocial,
}: {
  onNew: () => void;
  onExisting: () => void;
  onSocial: (r: SocialResult) => void;
}) {
  return (
    <Screen>
      <div className="mt-4 flex items-start gap-3 rounded-[16px] bg-[var(--action-soft)] p-4">
        <ShieldCheck className="mt-[2px] h-6 w-6 shrink-0 text-[var(--action)]" aria-hidden="true" />
        <p className="text-[16px] leading-relaxed text-[var(--text)]">
          Your notes are locked on your own phone. We cannot read them, and we never share your
          information with anyone.
        </p>
      </div>

      <h1 className="mt-10 text-center text-[30px] font-bold leading-tight tracking-[-0.02em] text-[var(--text)]">
        Welcome to Virasat
      </h1>

      <div className="mt-9 space-y-3">
        <Button size="lg" onClick={onNew}>
          I am new to Virasat
        </Button>
        <Button variant="secondary" size="lg" onClick={onExisting}>
          I already use Virasat
        </Button>
      </div>

      <SocialButtons onResult={onSocial} />
    </Screen>
  );
}

function NewEmail({
  initial,
  onSent,
  onBack,
}: {
  initial?: string;
  onSent: (email: string) => void;
  onBack: () => void;
}) {
  const [email, setEmail] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await startSignUp(email.trim());
      onSent(email.trim().toLowerCase());
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Heading title="Your email address" body="We will send a code to this address to make sure it is yours." />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) void submit();
        }}
        className="space-y-4"
      >
        <Field id="signup-email" label="Email address">
          <input
            id="signup-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            className={INPUT}
          />
        </Field>
        <ErrorText>{error}</ErrorText>
        <button type="submit" className="sr-only" aria-hidden="true" tabIndex={-1} />
      </form>
      <BottomBar>
        <Button variant="quiet" onClick={onBack}>
          Back
        </Button>
        <Button size="lg" className="flex-1" disabled={!valid || busy} onClick={submit}>
          Send me a code
        </Button>
      </BottomBar>
    </Screen>
  );
}

function NewCode({
  email,
  socialTicket,
  onVerified,
  onBack,
}: {
  email: string;
  socialTicket?: string;
  onVerified: (signupTicket: string) => void;
  onBack: () => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await verifySignUpCode(email, code, socialTicket);
      onVerified(r.signupTicket);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <MailCheck className="mx-auto mt-8 h-14 w-14 text-[var(--success)]" strokeWidth={1.5} aria-hidden="true" />
      <Heading
        title="Check your email"
        body={
          <>
            We sent six numbers to <strong className="text-[var(--text)]">{email}</strong>. They work for
            10 minutes.
          </>
        }
      />
      <DigitsField id="signup-code" label="The code from the email" value={code} onChange={setCode} autoFocus />
      <div className="mt-4">
        <ErrorText>{error}</ErrorText>
      </div>
      <button
        type="button"
        onClick={() => void startSignUp(email)}
        className="mt-4 text-[16px] text-[var(--action)] underline"
      >
        Send the code again
      </button>
      <BottomBar>
        <Button variant="quiet" onClick={onBack}>
          Back
        </Button>
        <Button size="lg" className="flex-1" disabled={code.length !== 6 || busy} onClick={submit}>
          Confirm
        </Button>
      </BottomBar>
    </Screen>
  );
}

function NewDetails({
  signupTicket,
  email,
  name: initialName,
  viaProvider,
  onCreated,
}: {
  signupTicket: string;
  email: string;
  name?: string;
  viaProvider?: boolean;
  onCreated: (kitCode: string) => void;
}) {
  const [name, setName] = useState(initialName ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const problem = password ? passwordProblem(password) : null;
  const mismatch = confirm && confirm !== password ? "The two passwords are not the same." : null;
  const ready = name.trim() && password && !problem && confirm === password;

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const { recoveryCode } = await finishSignUp({ signupTicket, name: name.trim(), email, password });
      onCreated(recoveryCode);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Heading
        title="Choose your password"
        body={
          viaProvider
            ? "We have your name and email. Now choose a Virasat password: it is what locks your notes, so even your Google or Apple account cannot open them."
            : "Your password locks your notes. We never see it, so we cannot reset it for you — that is what the Recovery Kit is for."
        }
      />
      <div className="space-y-5">
        <Field id="signup-name" label="Your name">
          <input id="signup-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={INPUT} />
        </Field>
        <Field id="signup-email-shown" label="Email address">
          <input id="signup-email-shown" value={email} readOnly className={`${INPUT} bg-[var(--surface-sunken)]`} />
        </Field>
        <Field id="signup-password" label="Password" hint="At least 10 characters. Three or four unrelated words are easy to remember and hard to guess.">
          <input
            id="signup-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={INPUT}
          />
        </Field>
        <Field id="signup-password-confirm" label="Type the password again">
          <input
            id="signup-password-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={INPUT}
          />
        </Field>
        <ErrorText>{problem || mismatch || error}</ErrorText>
      </div>
      <BottomBar>
        <Button size="lg" disabled={!ready || busy} onClick={submit}>
          {busy ? "Creating your account…" : "Create my account"}
        </Button>
      </BottomBar>
    </Screen>
  );
}

function Existing({
  email: initialEmail,
  linkTicket,
  notice,
  onNext,
  onBack,
}: {
  email?: string;
  linkTicket?: string;
  notice?: string;
  onNext: (needs: string[]) => void;
  onBack: () => void;
}) {
  const { device } = useAuth();
  const [email, setEmail] = useState(initialEmail ?? device?.email ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await signInWithPassword(email.trim(), password, linkTicket);
      onNext(getAuthState().needs);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Heading title="Sign in" />
      {notice && (
        <p className="mb-6 rounded-[14px] bg-[var(--action-soft)] p-4 text-[16px] leading-relaxed text-[var(--text)]">
          {notice}
        </p>
      )}
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (email && password) void submit();
        }}
      >
        <Field id="signin-email" label="Email address">
          <input
            id="signin-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={INPUT}
          />
        </Field>
        <Field id="signin-password" label="Password">
          <input
            id="signin-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={INPUT}
          />
        </Field>
        <ErrorText>{error}</ErrorText>
        <button type="submit" className="sr-only" aria-hidden="true" tabIndex={-1} />
      </form>
      <Link href="/welcome/recover" className="mt-5 block text-[16px] text-[var(--action)] underline">
        Forgot your password?
      </Link>
      <BottomBar>
        <Button variant="quiet" onClick={onBack}>
          Back
        </Button>
        <Button size="lg" className="flex-1" disabled={!email || !password || busy} onClick={submit}>
          {busy ? "Checking…" : "Sign in"}
        </Button>
      </BottomBar>
    </Screen>
  );
}

function NewPhoneCode({ onVerified }: { onVerified: () => void }) {
  const { user } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await submitCode(code);
      onVerified();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <MailCheck className="mx-auto mt-8 h-14 w-14 text-[var(--success)]" strokeWidth={1.5} aria-hidden="true" />
      <Heading
        title="This is a new phone"
        body={
          <>
            To keep your notes safe, we sent six numbers to{" "}
            <strong className="text-[var(--text)]">{user?.email ?? "your email"}</strong>. Enter them
            to set up this phone.
          </>
        }
      />
      <DigitsField id="device-code" label="The code from the email" value={code} onChange={setCode} autoFocus />
      <div className="mt-4">
        <ErrorText>{error}</ErrorText>
      </div>
      <button type="button" onClick={() => void resendCode()} className="mt-4 text-[16px] text-[var(--action)] underline">
        Send the code again
      </button>
      <BottomBar>
        <Button size="lg" disabled={code.length !== 6 || busy} onClick={submit}>
          Confirm
        </Button>
      </BottomBar>
    </Screen>
  );
}
