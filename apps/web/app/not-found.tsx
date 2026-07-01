import Link from "next/link";

// 404 boundary. Server Component (no interactivity needed). Rendered inside
// RootLayout, so Tailwind v4 @theme tokens apply.
export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="w-full max-w-md text-center">
        <p className="font-heading text-sm font-semibold uppercase tracking-wide text-text-secondary">
          404
        </p>
        <h1 className="mt-2 font-heading text-2xl font-semibold text-text-primary">
          Page not found
        </h1>
        <p className="mt-2 text-text-secondary">
          The page you&rsquo;re looking for doesn&rsquo;t exist or may have been moved.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-cta px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-cta-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cta"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}
