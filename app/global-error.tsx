"use client";

/**
 * Last-resort boundary for an error thrown in the root layout itself, where
 * app/error.tsx cannot help because the shell never mounted. It has to render
 * its own <html> and <body>, and it cannot rely on AppShell, the design
 * tokens or any provider — so the styles here are deliberately inline.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          background: "#f7f8fb",
          color: "#11161c",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div style={{ maxWidth: "34ch", textAlign: "center" }}>
          <h1 style={{ fontSize: "24px", lineHeight: 1.3, margin: "0 0 12px" }}>
            Virasat could not start
          </h1>
          <p style={{ fontSize: "17px", lineHeight: 1.6, color: "#5b6472", margin: "0 0 28px" }}>
            Nothing has been lost. Your notes stay encrypted on this device and
            on the server. Please try again.
          </p>
          <button
            onClick={reset}
            style={{
              minHeight: "60px",
              width: "100%",
              padding: "0 24px",
              fontSize: "18px",
              fontWeight: 600,
              color: "#ffffff",
              background: "#0b6e7f",
              border: "none",
              borderRadius: "14px",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          {error.digest && (
            <p style={{ marginTop: "28px", fontSize: "14px", color: "#5b6472" }}>
              Reference: <span style={{ fontFamily: "monospace" }}>{error.digest}</span>
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
