import type { LocalePack } from "../types";

/**
 * International / default pack.
 *
 * The universal tree is already written in international English, so this
 * pack is intentionally empty. It exists so that "no overrides" is an
 * explicit, named choice rather than a missing file, and so other markets
 * (UK, US, AE) can be added beside it without touching the tree.
 */
export const INTL_PACK: LocalePack = {
  code: "INTL",
  name: "International",
};
