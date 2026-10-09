/**
 * The brand wave: an ink band that dissolves into the page through two
 * offset crests. Used under the header and, inverted, above the action bar.
 * Decorative only — hidden from assistive technology.
 */
export function HeaderWave({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`block w-full ${className}`}
      viewBox="0 0 390 72"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M0 0h390v26C300 60 90-4 0 44V0Z" fill="var(--ink-800)" />
      <path d="M0 44C90-4 300 60 390 26v22C300 82 90 18 0 66V44Z" fill="#e3e9f2" />
    </svg>
  );
}

export function FooterWave({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`block w-full ${className}`}
      viewBox="0 0 390 48"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M0 26C98-8 292 40 390 12v36H0V26Z" fill="#eef1f7" />
    </svg>
  );
}
