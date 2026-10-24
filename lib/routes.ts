/**
 * Virasat - App URLs that carry runtime values.
 *
 * The app builds as a static export, so only paths known at build time can be
 * real routes. Note ids and invite tokens are created at runtime, so they
 * travel in the query string instead of the path. Building them here keeps
 * that rule in one place.
 */

export function noteHref(subcategoryId: string, noteId: string): string {
  return `/notes/view?sub=${encodeURIComponent(subcategoryId)}&id=${encodeURIComponent(noteId)}`;
}

export function inviteAcceptPath(token: string): string {
  return `/trusted-friends/accept?token=${encodeURIComponent(token)}`;
}
