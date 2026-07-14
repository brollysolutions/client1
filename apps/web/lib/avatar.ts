// Deterministic letter-avatar helpers (Google/Slack style). Pure, no React.
//
// The initial and the colour are both derived from the user's name, so the same
// person always renders the same tile on every device and session. A truly
// random colour would change on each load; a hash keeps it stable while still
// spreading users across the palette.

// Must match the count of --color-avatar-N tokens in app/globals.css and the
// bg-avatar-N class list in components/user-avatar.tsx.
export const AVATAR_PALETTE_SIZE = 8;

// FNV-1a (32-bit): small, stable, well-distributed. Deterministic across
// runtimes (unlike Math.random), so a user's colour never drifts.
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // 32-bit FNV prime, kept in Uint32 range
  }
  return hash >>> 0;
}

// First alphabetic character of the name, uppercased. Falls back to the email
// local-part, then "?" — never renders an empty tile.
export function avatarInitial(name?: string | null, email?: string | null): string {
  const fromName = (name ?? "").match(/\p{L}/u)?.[0];
  if (fromName) return fromName.toUpperCase();
  const fromEmail = (email ?? "").match(/\p{L}/u)?.[0];
  if (fromEmail) return fromEmail.toUpperCase();
  return "?";
}

// Stable palette index in [1, AVATAR_PALETTE_SIZE] from a seed. Normalises the
// seed so casing and stray whitespace don't change the chosen colour.
export function avatarColorIndex(seed: string): number {
  const normalized = seed.trim().toLowerCase();
  return (fnv1a(normalized) % AVATAR_PALETTE_SIZE) + 1;
}
