import type { CategoryGroupDef } from "./types";

/**
 * The universal category structure, with international-English defaults.
 *
 * Subcategory ids are permanent contract: notes persist them. Change a label
 * freely; never change an id without a migration.
 */
export const CATEGORY_TREE: CategoryGroupDef[] = [
  {
    id: "insurance",
    label: "Insurance Policies",
    icon: "insurance",
    subcategories: [
      {
        id: "insurance.life",
        label: "Life Insurance Policies",
        helper: "Your life insurance policies, the insurers, and where the documents are kept",
        essential: true,
      },
      {
        id: "insurance.property",
        label: "Home, Buildings, Contents and Property Insurance",
        helper: "Policies covering your home, its structure, contents or other property, and the insurers",
      },
      {
        id: "insurance.motor",
        label: "Motor Insurance",
        helper: "Policies covering your vehicles, and the names of the insurers",
      },
      {
        id: "insurance.health",
        label: "Health or Critical Illness Insurance",
        helper: "Health, critical illness or medical cover, and the names of the insurers",
        essential: true,
      },
      {
        id: "insurance.travel",
        label: "Travel Insurance",
        helper: "Travel insurance policies and the names of the insurers",
      },
      {
        id: "insurance.liability",
        label: "Liability, D&O or Professional Indemnity Insurance",
        helper: "Civil liability, directors and officers, or professional indemnity cover",
      },
      {
        id: "insurance.other",
        label: "Other Insurance Policies",
        helper: "Any other cover (e.g. income protection, pet, gadget or phone insurance) and the insurers",
      },
    ],
  },
  {
    id: "banks",
    label: "Banks and Financial Institutions",
    icon: "banks",
    subcategories: [
      {
        id: "banks.accounts",
        label: "Bank Accounts",
        helper: "Your bank accounts and the names of the banks",
        essential: true,
      },
      {
        id: "banks.brokerage",
        label: "Investment, Share Trading or Brokerage Accounts",
        helper: "Investment and brokerage accounts, and the names of the platforms or providers",
      },
      {
        id: "banks.exchanges",
        label: "Exchanges",
        helper: "Exchange-based trading accounts (e.g. commodity, crypto) and the platform names",
      },
      {
        id: "banks.cards",
        label: "Credit Cards",
        helper: "Your credit cards and the card providers",
        essential: true,
      },
      {
        id: "banks.retirement",
        label: "Retirement Accounts",
        helper: "Pensions and retirement plans, the providers, and any state pension entitlement",
        essential: true,
      },
      {
        id: "banks.other",
        label: "Other Financial Accounts or Products",
        helper: "Any financial account or product not covered by the categories above",
      },
    ],
  },
  {
    id: "assets",
    label: "Assets, Investments, Savings",
    icon: "assets",
    subcategories: [
      {
        id: "assets.realestate",
        label: "Real Estate",
        helper: "Where the original deeds, sale and purchase agreements or lease documents are kept",
        essential: true,
      },
      {
        id: "assets.vehicles",
        label: "Vehicles",
        helper: "Where the original vehicle documents are kept (registration, service history, proof of purchase, finance papers)",
      },
      {
        id: "assets.shares",
        label: "Shares and Financial Instruments",
        helper: "Where any original share certificates, transfer forms or paper instruments are held",
      },
      {
        id: "assets.savings",
        label: "Savings in Financial Institutions",
        helper: "Savings held in banks or other financial institutions",
      },
      {
        id: "assets.othersavings",
        label: "Other Savings",
        helper: "Money held outside financial institutions (e.g. a safe deposit box, cash at home)",
      },
      {
        id: "assets.moneyowed",
        label: "Other Money Owed to You",
        helper: "Money owed to you by a person, business or institution (e.g. loans to family or friends, unpaid refunds)",
      },
      {
        id: "assets.business",
        label: "Business Interests or Arrangements",
        helper: "Formal or informal business arrangements (e.g. stakes in businesses, joint ventures, royalties, receivables)",
      },
      {
        id: "assets.alternative",
        label: "Alternative Investments",
        helper: "Alternative holdings (e.g. cryptocurrencies, gold, collectibles)",
      },
      {
        id: "assets.valuables",
        label: "Valuables",
        helper: "Other valuables (e.g. jewellery, artwork, heirlooms)",
        essential: true,
      },
      {
        id: "assets.other",
        label: "Other Assets",
        helper: "Any other assets or receivables not covered above",
      },
    ],
  },
  {
    id: "liabilities",
    label: "Financial Liabilities",
    icon: "liabilities",
    subcategories: [
      {
        id: "liabilities.secured",
        label: "Mortgages and Secured Loans",
        helper: "Loans secured against your home or other property, and the lenders",
        essential: true,
      },
      {
        id: "liabilities.institutional",
        label: "Loans from Banks or Institutions",
        helper: "Personal loans, overdrafts and other borrowing from banks or finance companies",
      },
      {
        id: "liabilities.individuals",
        label: "Loans Owed to Individuals",
        helper: "Money you owe to family, friends or other individuals",
      },
      {
        id: "liabilities.guarantees",
        label: "Guarantees",
        helper: "Guarantees or collateral you have provided for someone else's obligations",
      },
      {
        id: "liabilities.student",
        label: "Student Loans",
        helper: "Any student loans and the lenders",
      },
      {
        id: "liabilities.leasing",
        label: "Leasing and Hire Purchase",
        helper: "Lease or hire-purchase agreements (e.g. cars, office equipment, appliances)",
      },
      {
        id: "liabilities.tax",
        label: "Tax, Court or Administrative Obligations",
        helper: "Past, outstanding or expected tax, court orders, or other legal and administrative obligations",
      },
      {
        id: "liabilities.other",
        label: "Other Obligations",
        helper: "Any other obligation not covered above",
      },
    ],
  },
  {
    id: "home",
    label: "Home and Living Arrangements",
    icon: "home",
    subcategories: [
      {
        id: "home.residence",
        label: "Home and Tenancy Documents",
        helper: "Where your tenancy agreement, ownership papers or residence documents are kept",
        essential: true,
      },
      {
        id: "home.utilities",
        label: "Utilities",
        helper: "Utility providers (e.g. power, gas, water, mobile, internet, landline)",
        essential: true,
      },
      {
        id: "home.other",
        label: "Other Household Matters",
        helper: "Any other essential matters about your home and living arrangements",
      },
    ],
  },
  {
    id: "family",
    label: "Family and Personal Matters",
    icon: "family",
    subcategories: [
      {
        id: "family.ids",
        label: "Passport, IDs and Travel Documents",
        helper: "Where your passport, driving licence, government ID or other travel documents are kept",
        essential: true,
      },
      {
        id: "family.medical",
        label: "Medical Documentation",
        helper: "Where your health records and medical documents are kept",
        essential: true,
      },
      {
        id: "family.lawyers",
        label: "Lawyers, Solicitors and Agents",
        helper: "Contact details for any lawyers, solicitors or agents, including any power of attorney",
      },
      {
        id: "family.contacts",
        label: "Important Contacts",
        helper: "People your family should reach out to (e.g. in an emergency, or to help settle your affairs)",
        essential: true,
      },
      {
        id: "family.will",
        label: "Will, Last Testament, Trusts",
        helper: "Where your will, testament or trust documents are kept, and who holds them",
        essential: true,
      },
      {
        id: "family.care",
        label: "Care Arrangements for Family or Friends",
        helper: "Any lasting power of attorney or documents about the care of people who depend on you",
      },
      {
        id: "family.matters",
        label: "Other Important Matters",
        helper: "Any other important matters or documents you want your Beneficiary to know about",
      },
    ],
  },
  {
    id: "digital",
    label: "Digital Identity and Communication",
    icon: "digital",
    subcategories: [
      {
        id: "digital.email",
        label: "Email Accounts",
        helper: "Your main email account and any others you use",
        essential: true,
      },
      {
        id: "digital.social",
        label: "Social and Entertainment Accounts",
        helper: "Social media and entertainment accounts (e.g. Facebook, Instagram, streaming services)",
      },
      {
        id: "digital.services",
        label: "Other Digital Services",
        helper: "Other digital services (e.g. cloud storage, software subscriptions, online purchases)",
      },
      {
        id: "digital.other",
        label: "Other Digital Matters",
        helper: "Anything else about your digital life you wish to pass on",
      },
    ],
  },
  {
    id: "notebook",
    label: "Personal Notebook",
    icon: "notebook",
    subcategories: [
      {
        id: "notebook.important",
        label: "Important Notes",
        helper: "Any other notes or messages for your Beneficiary or the people you love",
        essential: true,
      },
    ],
  },
];
