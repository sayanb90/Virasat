import { CATEGORY_TREE } from "@/lib/taxonomy/tree";
import { LOCALE_PACKS, resolveTaxonomy } from "@/lib/taxonomy";
import type { CountryCode } from "@/lib/taxonomy/types";

/**
 * The app builds as a static export, so every subcategory page is generated
 * at build time.
 *
 * It must be every id from EVERY locale pack, not just the active one. A note
 * filed under an India-only subcategory ("banks.nominees") has to stay
 * reachable after the owner switches country — that is the guarantee
 * `localisation.spec.ts` holds — and a page that was never generated cannot
 * be reached at all.
 */
export const dynamicParams = false;

export function generateStaticParams(): { subcategoryId: string }[] {
  const ids = new Set<string>();
  for (const group of CATEGORY_TREE) for (const sub of group.subcategories) ids.add(sub.id);
  for (const country of Object.keys(LOCALE_PACKS) as CountryCode[]) {
    for (const group of resolveTaxonomy(country)) {
      for (const sub of group.subcategories) ids.add(sub.id);
    }
  }
  return [...ids].sort().map((subcategoryId) => ({ subcategoryId }));
}

export default function SubcategoryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
