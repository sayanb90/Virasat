/**
 * Virasat Taxonomy — types
 *
 * The category tree is split into two layers:
 *
 *   1. A universal STRUCTURE (group ids + subcategory ids) that never varies
 *      by market. Stored notes reference these ids, so a user can change
 *      country without their notes being orphaned.
 *
 *   2. A LOCALE PACK that supplies the market-specific vocabulary — labels,
 *      the "e.g." helper line, extra subcategories, and ordering.
 *
 * Adding a market is therefore a content task, not a refactor.
 */

export type CountryCode = "IN" | "INTL";

export type IconKey =
  | "insurance"
  | "banks"
  | "assets"
  | "liabilities"
  | "home"
  | "family"
  | "digital"
  | "notebook";

export interface SubcategoryDef {
  /** Stable, locale-independent, e.g. "insurance.life". Persisted on notes. */
  id: string;
  label: string;
  /** Plain-English guidance shown under the label. The single most useful
   *  affordance in the reference app — it tells users what belongs here. */
  helper: string;
  /**
   * Marks the subcategories a typical user actually has. Unused today (we
   * render the full tree), but present so an "Essentials" view is a filter
   * rather than a re-modelling exercise.
   */
  essential?: boolean;
}

export interface CategoryGroupDef {
  id: string;
  label: string;
  icon: IconKey;
  subcategories: SubcategoryDef[];
}

/** A locale pack patches the universal tree; it never replaces it. */
export interface LocalePack {
  code: CountryCode;
  /** Shown in the country picker. */
  name: string;
  /** Group label overrides, keyed by group id. */
  groups?: Record<string, string>;
  /** Subcategory overrides, keyed by subcategory id. */
  subcategories?: Record<string, Partial<Omit<SubcategoryDef, "id">> & { hidden?: boolean }>;
  /** Extra subcategories appended to a group, keyed by group id. */
  additions?: Record<string, SubcategoryDef[]>;
  /**
   * Explicit subcategory ordering for a group, keyed by group id. Ids listed
   * here lead, in this order; anything unlisted keeps its tree order behind
   * them. Lets a market surface what its users care about most.
   */
  order?: Record<string, string[]>;
}
