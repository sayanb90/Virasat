import { Suspense } from "react";
import NoteView from "./NoteView";

/**
 * /notes/view?sub=…&id=…
 *
 * One static page for every note; which note is read from the query string.
 * `useSearchParams` needs a Suspense boundary in a static export.
 */
export default function NotePage() {
  return (
    <Suspense fallback={null}>
      <NoteView />
    </Suspense>
  );
}
