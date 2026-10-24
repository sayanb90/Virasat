/**
 * Virasat - App URLs that carry runtime values.
 *
 * The app builds as a static export, so only paths known at build time can be
 * real routes. Note ids and invite tokens are created at runtime, so they
 * travel in the query string instead of the path. Building them here keeps
 * that rule in one place.
 *
 * Subcategory ids travel there too, though they are known at build time.
 * They contain dots ("banks.nominees"), and the native shell's local server
 * treats a last path segment with a dot as a file name: a reload on
 * /notes/banks.nominees would find no file and show a blank screen. Every app
 * path is therefore extensionless.
 */

export function categoryHref(subcategoryId: string): string {
  return `/notes/category?sub=${encodeURIComponent(subcategoryId)}`;
}

export function newNoteHref(subcategoryId: string): string {
  return `/notes/new?sub=${encodeURIComponent(subcategoryId)}`;
}

export function noteHref(subcategoryId: string, noteId: string): string {
  return `/notes/view?sub=${encodeURIComponent(subcategoryId)}&id=${encodeURIComponent(noteId)}`;
}

export function inviteAcceptPath(token: string): string {
  return `/trusted-friends/accept?token=${encodeURIComponent(token)}`;
}
