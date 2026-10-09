import { CATEGORY_TREE } from "./tree";
import { INTL_PACK } from "./locales/intl";
import { IN_PACK } from "./locales/in";
import type { CategoryGroupDef, CountryCode, LocalePack, SubcategoryDef } from "./types";

export * from "./types";
export { CATEGORY_TREE } from "./tree";

export const LOCALE_PACKS: Record<CountryCode, LocalePack> = {
  IN: IN_PACK,
  INTL: INTL_PACK,
};

export const DEFAULT_COUNTRY: CountryCode = "IN";

/** Countries offered in the onboarding picker and in Settings. */
export const COUNTRY_OPTIONS: { code: CountryCode; name: string }[] = [
  { code: "IN", name: IN_PACK.name },
  { code: "INTL", name: INTL_PACK.name },
];

export function isCountryCode(value: unknown): value is CountryCode {
  return value === "IN" || value === "INTL";
}

/**
 * Applies a locale pack's label/helper overrides, additions, hidden flags and
 * ordering to the universal tree. Pure — safe to call on the server, in tests,
 * or during render.
 */
export function resolveTaxonomy(country: CountryCode): CategoryGroupDef[] {
  const pack = LOCALE_PACKS[country] ?? INTL_PACK;

  return CATEGORY_TREE.map((group) => {
    const overrides = pack.subcategories ?? {};

    const patched: SubcategoryDef[] = group.subcategories
      .map((sub) => {
        const o = overrides[sub.id];
        if (!o) return sub;
        if (o.hidden) return null;
        return {
          ...sub,
          ...(o.label !== undefined ? { label: o.label } : {}),
          ...(o.helper !== undefined ? { helper: o.helper } : {}),
          ...(o.essential !== undefined ? { essential: o.essential } : {}),
        };
      })
      .filter((s): s is SubcategoryDef => s !== null);

    const added = pack.additions?.[group.id] ?? [];
    const combined = [...patched, ...added];

    const lead = pack.order?.[group.id];
    const subcategories = lead ? applyOrder(combined, lead) : combined;

    return {
      ...group,
      label: pack.groups?.[group.id] ?? group.label,
      subcategories,
    };
  });
}

/** Ids in `lead` come first in that order; everything else keeps tree order. */
function applyOrder(subs: SubcategoryDef[], lead: string[]): SubcategoryDef[] {
  const byId = new Map(subs.map((s) => [s.id, s]));
  const ordered: SubcategoryDef[] = [];

  for (const id of lead) {
    const match = byId.get(id);
    if (match) {
      ordered.push(match);
      byId.delete(id);
    }
  }
  // Preserve original relative order for the remainder.
  for (const sub of subs) {
    if (byId.has(sub.id)) ordered.push(sub);
  }
  return ordered;
}

export function findGroup(country: CountryCode, groupId: string): CategoryGroupDef | undefined {
  return resolveTaxonomy(country).find((g) => g.id === groupId);
}

export interface SubcategoryLocation {
  group: CategoryGroupDef;
  subcategory: SubcategoryDef;
}

export function findSubcategory(
  country: CountryCode,
  subcategoryId: string
): SubcategoryLocation | undefined {
  for (const group of resolveTaxonomy(country)) {
    const subcategory = group.subcategories.find((s) => s.id === subcategoryId);
    if (subcategory) return { group, subcategory };
  }
  return undefined;
}

/**
 * Human-readable trail for a stored subcategory id. Falls back to the raw id
 * so a note saved under a subcategory the current locale hides still renders
 * something meaningful rather than blank.
 */
export function describeSubcategory(
  country: CountryCode,
  subcategoryId: string
): { groupLabel: string; subcategoryLabel: string } {
  const found = findSubcategory(country, subcategoryId);
  if (found) {
    return { groupLabel: found.group.label, subcategoryLabel: found.subcategory.label };
  }
  // Not in the active locale: the note may have been filed under another
  // market's subcategory (e.g. an India-only one, after switching country).
  // Search every pack before giving up, so switching country never orphans
  // a note.
  for (const pack of Object.values(LOCALE_PACKS)) {
    for (const [groupId, additions] of Object.entries(pack.additions ?? {})) {
      const match = additions.find((s) => s.id === subcategoryId);
      if (match) {
        const group = CATEGORY_TREE.find((g) => g.id === groupId);
        return {
          groupLabel: group?.label ?? "Uncategorised",
          subcategoryLabel: match.label,
        };
      }
    }
  }

  const universal = CATEGORY_TREE.flatMap((g) =>
    g.subcategories.map((s) => ({ g, s }))
  ).find(({ s }) => s.id === subcategoryId);

  return universal
    ? { groupLabel: universal.g.label, subcategoryLabel: universal.s.label }
    : { groupLabel: "Uncategorised", subcategoryLabel: subcategoryId };
}

/**
 * Resolves a subcategory id against an already-resolved taxonomy.
 *
 * Plain function rather than a memo: it is a scan over ~50 entries, and
 * wrapping it in useMemo defeats the React Compiler for no measurable gain.
 */
export function locateSubcategory(
  taxonomy: CategoryGroupDef[],
  subcategoryId: string
): SubcategoryLocation | null {
  for (const group of taxonomy) {
    const subcategory = group.subcategories.find((s) => s.id === subcategoryId);
    if (subcategory) return { group, subcategory };
  }
  return null;
}
