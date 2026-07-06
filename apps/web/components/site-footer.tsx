// Minimal public-site footer. The home-page line illustrations are Storyset
// (Freepik) vectors, recolored to our palette, so the free tier owes an
// attribution link. Keep the credit until they are replaced or a Freepik
// Premium license is bought. When a full footer is designed, expand this.
export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-[var(--nav-border)] bg-[var(--nav-bg)]">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-center gap-1 px-4 py-6 text-center text-sm text-muted-foreground">
        <p>&copy; {year} Loans &amp; Real Estate. All rights reserved.</p>
        <p className="text-xs">
          Illustrations by{" "}
          <a
            href="https://storyset.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-[var(--nav-text)]"
          >
            Storyset
          </a>
        </p>
      </div>
    </footer>
  );
}
