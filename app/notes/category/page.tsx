import { Suspense } from "react";
import CategoryView from "./CategoryView";

/**
 * /notes/category?sub=…
 *
 * One static page for every subcategory; which one is read from the query
 * string (see lib/routes.ts for why it is not in the path). `useSearchParams`
 * needs a Suspense boundary in a static export.
 */
export default function CategoryPage() {
  return (
    <Suspense fallback={null}>
      <CategoryView />
    </Suspense>
  );
}
