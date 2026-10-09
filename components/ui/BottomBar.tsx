import React from "react";
import { FooterWave } from "./Wave";

/**
 * Anchored action bar. Content varies by screen (Cancel/Save, New note/Edit,
 * or a single full-width action) and always sits above the brand wave.
 */
export function BottomBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 z-30 mt-10">
      <FooterWave className="h-[42px]" />
      <div className="bg-[#eef1f7] px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-1">
        <div className="mx-auto flex max-w-[640px] items-center gap-3">{children}</div>
      </div>
    </div>
  );
}
