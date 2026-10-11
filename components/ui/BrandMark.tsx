import React from "react";

/**
 * The Virasat mark: a "V" cut through an open rounded tile.
 *
 * Deliberately not a shield. A shield is the stock signifier every security
 * and estate app reaches for, which makes it both unownable and the easiest
 * way to end up looking like somebody else's product. A letterform inside a
 * geometric frame is specific to this name and distinguishable at 24px.
 *
 * Drawn with currentColor so it inherits from whatever it sits on.
 */
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {/* Open frame: the gap at the top-right keeps it from reading as a badge. */}
      <path
        d="M28 4.5h-16A7.5 7.5 0 0 0 4.5 12v16A7.5 7.5 0 0 0 12 35.5h16A7.5 7.5 0 0 0 35.5 28v-9"
        stroke="currentColor"
        strokeWidth="2.75"
        strokeLinecap="round"
      />
      {/* The V. */}
      <path
        d="M13.5 13.5 20 26.5l6.5-13"
        stroke="currentColor"
        strokeWidth="3.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
