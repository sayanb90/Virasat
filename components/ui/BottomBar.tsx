import React from "react";

/**
 * Anchored action bar. Content varies by screen (Cancel/Save, New note/Edit,
 * or a single full-width action).
 *
 * The keyline on top mirrors the one closing the header, replacing the wave
 * that used to sit here. The two waves were one motif, so taking it out of
 * the header and leaving it here would have left the app reading as two
 * different designs stacked on each other.
 */
export function BottomBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 z-30 mt-10">
      <div className="h-[3px] w-full bg-[var(--marigold)]" aria-hidden="true" />
      <div className="bg-[var(--surface-sunken)] px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3.5">
        <div className="mx-auto flex max-w-[640px] items-center gap-3">{children}</div>
      </div>
    </div>
  );
}
