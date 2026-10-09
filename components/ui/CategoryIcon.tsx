import {
  Landmark,
  PiggyBank,
  HandCoins,
  House,
  Users,
  Fingerprint,
  NotebookTabs,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import type { IconKey } from "@/lib/taxonomy";

const ICONS: Record<IconKey, LucideIcon> = {
  insurance: ShieldCheck,
  banks: Landmark,
  assets: PiggyBank,
  liabilities: HandCoins,
  home: House,
  family: Users,
  digital: Fingerprint,
  notebook: NotebookTabs,
};

export function CategoryIcon({
  name,
  className = "w-7 h-7",
}: {
  name: IconKey;
  className?: string;
}) {
  const Icon = ICONS[name] ?? NotebookTabs;
  return <Icon className={className} strokeWidth={1.75} aria-hidden="true" />;
}
