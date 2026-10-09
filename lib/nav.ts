/**
 * Drawer destinations.
 *
 * Plain data in its own module so it can be asserted on in tests without
 * pulling a client component (and its React/Next imports) into the runner.
 */
export interface NavItem {
  href: string;
  label: string;
  external?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/notes", label: "My notes" },
  { href: "/heartbeat", label: "Safety check-in" },
  { href: "/trusted-friends", label: "Trusted Friends" },
  { href: "/beneficiaries", label: "Beneficiary" },
  { href: "/backup", label: "Backup" },
  { href: "/inherited", label: "Inherited notes" },
  { href: "/settings", label: "Settings" },
  { href: "/help", label: "Help Centre", external: true },
];
