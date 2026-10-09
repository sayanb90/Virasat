"use client";

import React, { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/locale/LocaleProvider";
import { locateSubcategory } from "@/lib/taxonomy";
import { useVaultSession } from "@/lib/vault/VaultSession";
import { UnlockScreen } from "@/components/UnlockScreen";
import { NoteForm } from "@/components/NoteForm";
import { EmptyState } from "@/components/ui/Page";
import { ButtonLink } from "@/components/ui/Button";
import { fetchBeneficiaries } from "@/lib/vault/notes";
import type { BeneficiaryRecord } from "@/lib/state/mockDatabase";

export default function NewNotePage({
  params,
}: {
  params: Promise<{ subcategoryId: string }>;
}) {
  const { subcategoryId } = use(params);
  const router = useRouter();
  const { taxonomy, ready } = useLocale();
  const { masterKey } = useVaultSession();
  const [beneficiaries, setBeneficiaries] = useState<BeneficiaryRecord[]>([]);

  useEffect(() => {
    fetchBeneficiaries().then(setBeneficiaries).catch(() => setBeneficiaries([]));
  }, []);

  const location = locateSubcategory(taxonomy, subcategoryId);

  if (!masterKey) return <UnlockScreen />;
  if (!ready) return null;

  if (!location) {
    return (
      <EmptyState
        title="We could not find that category"
        body="It may have been renamed, or it may not apply in the country you have selected."
        action={<ButtonLink href="/notes" size="lg">Back to categories</ButtonLink>}
      />
    );
  }

  return (
    <NoteForm
      mode="create"
      groupLabel={location.group.label}
      subcategoryLabel={location.subcategory.label}
      subcategoryId={subcategoryId}
      masterKey={masterKey}
      beneficiaries={beneficiaries}
      onCancel={() => router.back()}
      onSaved={(id) => router.replace(`/notes/${subcategoryId}/${id}`)}
    />
  );
}
