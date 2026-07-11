"use client";

// Root-level error boundary. It renders OUTSIDE the RootLayout (it replaces it),
// so `globals.css` and the next/font variables are NOT applied here — styling
// must be self-contained (inline), and the element must render its own
// <html>/<body>.
//
// Shipping this file also fixes a Next 15.5.x RSC bug where the framework's
// *built-in* global-error client module fails to register in the React Client
// Manifest ("Could not find the module .../builtin/global-error.js# ..."): with
// an explicit boundary here, Next bundles and registers a real module instead.

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
          backgroundColor: "#F3F3EE",
          color: "#20242E",
          fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        <main style={{ maxWidth: 480, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: "0 0 8px" }}>
            Something went wrong
          </h1>
          <p style={{ margin: "0 0 24px", color: "#5C5C5C", lineHeight: 1.5 }}>
            An unexpected error occurred. You can try again, and if the problem
            persists please contact support.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              cursor: "pointer",
              border: "none",
              borderRadius: 8,
              padding: "10px 20px",
              fontSize: 15,
              fontWeight: 500,
              color: "#FFFFFF",
              backgroundColor: "#C9792B",
            }}
          >
            Try again
          </button>
          {error.digest ? (
            <p style={{ marginTop: 24, fontSize: 12, color: "#5C5C5C" }}>
              Error reference: {error.digest}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
