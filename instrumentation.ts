/**
 * Runs once when the server starts (Next.js instrumentation).
 *
 * With DATA_FILE set, every store is loaded from that file and saved back as
 * it changes (lib/persistence/snapshot.ts): the stand-in for a database
 * until there is one. Without it, everything stays in memory, as before.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.DATA_FILE) return;
  const { startFilePersistence } = await import("./lib/persistence/snapshot");
  startFilePersistence(process.env.DATA_FILE);
}
