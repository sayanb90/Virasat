import { ButtonLink } from "@/components/ui/Button";
import { Eyebrow, PageTitle } from "@/components/ui/Page";

/** Shown for any address that does not exist, instead of Next's bare 404. */
export default function NotFound() {
  return (
    <div className="pb-10">
      <Eyebrow>Not found</Eyebrow>
      <PageTitle>That page does not exist</PageTitle>

      <div className="px-6">
        <p className="text-[17px] leading-relaxed text-[var(--text-muted)] max-w-[36ch]">
          The link may be old, or it may have been typed slightly differently.
          Your notes are untouched.
        </p>

        <div className="mt-8 space-y-3">
          <ButtonLink href="/" size="lg">
            Go to the home screen
          </ButtonLink>
          <ButtonLink href="/notes" size="lg" variant="secondary">
            See my notes
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
