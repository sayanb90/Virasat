"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, MailCheck, Smartphone, FileKey } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { BottomBar } from "@/components/ui/BottomBar";
import { DigitsField, ErrorText, Field, Heading, INPUT, messageOf, passwordProblem } from "@/components/auth/Fields";
import { DeviceUnlock } from "@/components/auth/DeviceUnlock";
import { SetUpPhone } from "@/components/auth/SetUpPhone";
import { RecoveryKit } from "@/components/auth/RecoveryKit";
import {
  beginKitRecovery,
  boot,
  chooseNewPassword,
  completeKitRecovery,
  forgetKitRecovery,
  getAuthState,
  kitRecoveryStatus,
  startKitRecovery,
  startResetOnThisPhone,
  submitCode,
  useAuth,
} from "@/lib/auth/client";
import { normaliseRecoveryCode } from "@/lib/crypto/keys";

/**
 * Forgotten password (docs/authentication.md 3.6).
 *
 *   A — this phone still works:  Face ID / PIN → email code → new password
 *   B — the phone is lost too:   email code → Recovery Kit → 72-hour hold → new password
 */
type Step =
  | { k: "loading" }
  | { k: "choose" }
  | { k: "a-email" }
  | { k: "a-verify" }
  | { k: "a-password" }
  | { k: "b-email" }
  | { k: "b-code" }
  | { k: "b-kit" }
  | { k: "b-waiting"; releasableAt: number }
  | { k: "b-ready" }
  | { k: "b-new-kit"; code: string; email: string }
  | { k: "b-setup" }
  | { k: "b-ended" };

export default function RecoverPage() {
  const router = useRouter();
  const { device } = useAuth();
  const [step, setStep] = useState<Step>({ k: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await boot();
      const r = await kitRecoveryStatus();
      if (cancelled) return;
      if (r.state === "waiting") setStep({ k: "b-waiting", releasableAt: r.releasableAt! });
      else if (r.state === "ready") setStep({ k: "b-ready" });
      else if (r.state === "cancelled") setStep({ k: "b-ended" });
      else setStep({ k: "choose" });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const done = () => router.replace("/notes");

  switch (step.k) {
    case "loading":
      return null;
    case "choose":
      return (
        <Screen>
          <Heading title="Forgot your password?" body="That is all right. There are two ways back in." />
          <div className="space-y-4">
            {device && (
              <Choice
                icon={<Smartphone className="h-7 w-7" aria-hidden="true" />}
                title="I still have this phone"
                body="Use Face ID or your PIN, and a code from your email. Then choose a new password."
                onClick={() => setStep({ k: "a-email" })}
              />
            )}
            <Choice
              icon={<FileKey className="h-7 w-7" aria-hidden="true" />}
              title={device ? "I have lost my phone too" : "Use my Recovery Kit"}
              body="Use the Recovery Kit you printed when you joined. For your safety there is a 72-hour wait."
              onClick={() => setStep({ k: "b-email" })}
            />
          </div>
        </Screen>
      );

    /* --- Path A ---------------------------------------------------------- */
    case "a-email":
      return (
        <EmailStep
          initial={device?.email}
          body="We will send a code to this address."
          onSubmit={async (email) => {
            await startResetOnThisPhone(email);
            setStep({ k: "a-verify" });
          }}
          onBack={() => setStep({ k: "choose" })}
        />
      );
    case "a-verify":
      return <VerifyBoth onDone={() => setStep({ k: "a-password" })} />;
    case "a-password":
      return <NewPassword onSubmit={async (pw) => { await chooseNewPassword(pw); done(); }} />;

    /* --- Path B ---------------------------------------------------------- */
    case "b-email":
      return (
        <EmailStep
          body="Enter the email address on your Virasat account. We will send a code to it."
          onSubmit={async (email) => {
            await startKitRecovery(email);
            setStep({ k: "b-code" });
          }}
          onBack={() => setStep({ k: "choose" })}
        />
      );
    case "b-code":
      return <CodeStep onDone={() => setStep({ k: "b-kit" })} />;
    case "b-kit":
      return (
        <KitStep
          title="Enter your recovery code"
          body="It is on your Recovery Kit: twenty letters and numbers, in groups of four."
          onSubmit={async (code) => {
            const { releasableAt } = await beginKitRecovery(code);
            setStep({ k: "b-waiting", releasableAt });
          }}
        />
      );
    case "b-waiting":
      return (
        <Screen>
          <Clock className="mx-auto mt-8 h-14 w-14 text-[var(--action)]" strokeWidth={1.5} aria-hidden="true" />
          <Heading
            title="Please come back in 72 hours"
            body={
              <>
                For your safety, you can choose a new password from{" "}
                <strong className="text-[var(--text)]">{new Date(step.releasableAt).toLocaleString()}</strong>.
                We have emailed your account to say a recovery has started, so that if it is not you, it
                can be stopped.
              </>
            }
          />
          <Button variant="secondary" size="lg" onClick={() => router.replace("/welcome")}>
            Close
          </Button>
        </Screen>
      );
    case "b-ready":
      return (
        <KitAndPassword
          onDone={(code, email) => setStep({ k: "b-new-kit", code, email })}
        />
      );
    case "b-new-kit":
      return (
        <Screen>
          <p className="mt-6 rounded-[14px] bg-[var(--action-soft)] p-4 text-[16px] leading-relaxed text-[var(--text)]">
            Your old Recovery Kit has been used up. Here is a new one — please print it and throw the
            old one away.
          </p>
          <RecoveryKit code={step.code} email={step.email} onDone={() => setStep({ k: "b-setup" })} />
        </Screen>
      );
    case "b-setup":
      return (
        <Screen>
          <SetUpPhone onDone={done} />
        </Screen>
      );
    case "b-ended":
      return (
        <Screen>
          <Heading
            title="This recovery was stopped"
            body="Someone tapped “This is not me” in the email we sent. If that was a mistake, you can start again."
          />
          <Button
            size="lg"
            onClick={async () => {
              await forgetKitRecovery();
              setStep({ k: "choose" });
            }}
          >
            Start again
          </Button>
        </Screen>
      );
  }
}

/* ---------------------------------------------------------------------- */

function Screen({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 flex-col pb-8">{children}</div>;
}

function Choice({
  icon,
  title,
  body,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-4 rounded-[18px] border border-[var(--border-strong)] bg-white p-5 text-left hover:border-[var(--action-border)] hover:bg-[var(--action-soft)]"
    >
      <span className="text-[var(--action)]">{icon}</span>
      <span>
        <span className="block text-[19px] font-bold text-[var(--text)]">{title}</span>
        <span className="mt-1 block text-[16px] leading-relaxed text-[var(--text-muted)]">{body}</span>
      </span>
    </button>
  );
}

function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

function EmailStep({
  initial,
  body,
  onSubmit,
  onBack,
}: {
  initial?: string;
  body: string;
  onSubmit: (email: string) => Promise<void>;
  onBack: () => void;
}) {
  const [email, setEmail] = useState(initial ?? "");
  const { busy, error, run } = useAction();
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  return (
    <Screen>
      <Heading title="Your email address" body={body} />
      <Field id="recover-email" label="Email address">
        <input id="recover-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT} />
      </Field>
      <div className="mt-4">
        <ErrorText>{error}</ErrorText>
      </div>
      <BottomBar>
        <Button variant="quiet" onClick={onBack}>
          Back
        </Button>
        <Button size="lg" className="flex-1" disabled={!valid || busy} onClick={() => run(() => onSubmit(email.trim()))}>
          Send me a code
        </Button>
      </BottomBar>
    </Screen>
  );
}

function CodeStep({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState("");
  const { busy, error, run } = useAction();
  return (
    <Screen>
      <MailCheck className="mx-auto mt-8 h-14 w-14 text-[var(--success)]" strokeWidth={1.5} aria-hidden="true" />
      <Heading title="Check your email" body="We sent six numbers to your email address. They work for 10 minutes." />
      <DigitsField id="recover-code" label="The code from the email" value={code} onChange={setCode} autoFocus />
      <div className="mt-4">
        <ErrorText>{error}</ErrorText>
      </div>
      <BottomBar>
        <Button
          size="lg"
          disabled={code.length !== 6 || busy}
          onClick={() =>
            run(async () => {
              await submitCode(code);
              onDone();
            })
          }
        >
          Confirm
        </Button>
      </BottomBar>
    </Screen>
  );
}

/** Path A: Face ID / PIN and the email code, in whichever order. */
function VerifyBoth({ onDone }: { onDone: () => void }) {
  const { needs } = useAuth();
  useEffect(() => {
    if (needs.length === 0) onDone();
  }, [needs, onDone]);
  if (needs.includes("device")) {
    return (
      <Screen>
        <Heading title="Confirm it is you" body="Look at your phone, or enter your PIN." />
        <DeviceUnlock />
      </Screen>
    );
  }
  if (needs.includes("email-code")) return <CodeStep onDone={() => {}} />;
  return null;
}

function NewPassword({ onSubmit }: { onSubmit: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const { busy, error, run } = useAction();
  const problem = password ? passwordProblem(password) : null;
  const mismatch = confirm && confirm !== password ? "The two passwords are not the same." : null;
  return (
    <Screen>
      <Heading title="Choose a new password" body="Your notes stay exactly as they are." />
      <div className="space-y-5">
        <Field id="new-password" label="New password" hint="At least 10 characters.">
          <input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={INPUT} />
        </Field>
        <Field id="new-password-confirm" label="Type it again">
          <input id="new-password-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={INPUT} />
        </Field>
        <ErrorText>{problem || mismatch || error}</ErrorText>
      </div>
      <BottomBar>
        <Button
          size="lg"
          disabled={!password || !!problem || confirm !== password || busy}
          onClick={() => run(() => onSubmit(password))}
        >
          {busy ? "Saving…" : "Save my new password"}
        </Button>
      </BottomBar>
    </Screen>
  );
}

function KitStep({
  title,
  body,
  onSubmit,
}: {
  title: string;
  body: string;
  onSubmit: (code: string) => Promise<void>;
}) {
  const [code, setCode] = useState("");
  const { busy, error, run } = useAction();
  const valid = normaliseRecoveryCode(code) !== null;
  return (
    <Screen>
      <Heading title={title} body={body} />
      <Field id="kit-code" label="Recovery code">
        <input
          id="kit-code"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
          className={`${INPUT} font-mono uppercase tracking-[0.06em]`}
        />
      </Field>
      <div className="mt-4">
        <ErrorText>{error}</ErrorText>
      </div>
      <BottomBar>
        <Button size="lg" disabled={!valid || busy} onClick={() => run(() => onSubmit(code))}>
          Continue
        </Button>
      </BottomBar>
    </Screen>
  );
}

/** Path B after the hold: the kit code again, and the new password. */
function KitAndPassword({ onDone }: { onDone: (newCode: string, email: string) => void }) {
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const { busy, error, run } = useAction();
  const problem = password ? passwordProblem(password) : null;
  const ready = normaliseRecoveryCode(code) && password && !problem && confirm === password;

  return (
    <Screen>
      <Heading title="Welcome back" body="The wait is over. Enter your recovery code once more, and choose a new password." />
      <div className="space-y-5">
        <Field id="kit-code-again" label="Recovery code">
          <input
            id="kit-code-again"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={`${INPUT} font-mono uppercase tracking-[0.06em]`}
          />
        </Field>
        <Field id="kit-new-password" label="New password" hint="At least 10 characters.">
          <input id="kit-new-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={INPUT} />
        </Field>
        <Field id="kit-new-password-confirm" label="Type it again">
          <input id="kit-new-password-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={INPUT} />
        </Field>
        <ErrorText>{problem || (confirm && confirm !== password ? "The two passwords are not the same." : null) || error}</ErrorText>
      </div>
      <BottomBar>
        <Button
          size="lg"
          disabled={!ready || busy}
          onClick={() =>
            run(async () => {
              const { recoveryCode } = await completeKitRecovery(code, password);
              onDone(recoveryCode, getAuthState().user?.email ?? "");
            })
          }
        >
          {busy ? "Opening your notes…" : "Save my new password"}
        </Button>
      </BottomBar>
    </Screen>
  );
}
