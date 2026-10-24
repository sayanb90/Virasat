import { Suspense } from "react";
import NewNote from "./NewNote";

/**
 * /notes/new?sub=…
 *
 * One static page for adding a note under any subcategory. `useSearchParams`
 * needs a Suspense boundary in a static export.
 */
export default function NewNotePage() {
  return (
    <Suspense fallback={null}>
      <NewNote />
    </Suspense>
  );
}
