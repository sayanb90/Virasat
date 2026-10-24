import { Suspense } from "react";
import AcceptInvite from "./AcceptInvite";

/**
 * /trusted-friends/accept?token=…
 *
 * Opened from an emailed invitation, in a browser, by someone who is not a
 * Virasat user — so in the split deployment this page is served by the web
 * host, not the native app. `useSearchParams` needs a Suspense boundary in a
 * static export.
 */
export default function AcceptInvitePage() {
  return (
    <Suspense fallback={null}>
      <AcceptInvite />
    </Suspense>
  );
}
