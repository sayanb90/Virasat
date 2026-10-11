import type { LocalePack } from "../types";

/**
 * India pack.
 *
 * Same tree, Indian vocabulary. Where the international wording would leave
 * a user guessing ("Pensions & Retirement"), this names the instruments they
 * actually hold (EPF, PPF, NPS). Two additions have no international
 * counterpart but matter enormously here: nominee records and bank lockers.
 */
export const IN_PACK: LocalePack = {
  code: "IN",
  name: "India",

  subcategories: {
    "insurance.life": {
      label: "Life Cover",
      helper:
        "Your life cover — LIC, term plans, ULIPs or endowment policies. Include the policy numbers, the insurer, and your agent's details",
    },
    "insurance.health": {
      label: "Health Cover & Mediclaim",
      helper:
        "Mediclaim, family floater or critical illness cover, including CGHS or ESI, the insurer, and your TPA or card details",
    },
    "insurance.motor": {
      label: "Vehicle Cover",
      helper: "Cover for your car, scooter or other vehicles, and the names of the insurers",
    },

    "banks.accounts": {
      label: "Bank Accounts",
      helper:
        "Your savings and current accounts — the bank, branch, account type and IFSC, and the mobile number linked to each",
    },
    "banks.brokerage": {
      label: "Demat, Mutual Funds & Broking",
      helper:
        "Demat accounts (NSDL or CDSL DP ID and client ID), mutual fund folios, SIPs, and the names of your brokers or platforms",
    },
    "banks.retirement": {
      label: "Provident Funds & Pensions",
      helper:
        "EPF (and your UAN), PPF, NPS (and your PRAN), gratuity, superannuation and the Senior Citizens Savings Scheme",
    },
    "banks.cards": {
      label: "Credit & Debit Cards",
      helper: "Your credit cards and the banks that issued them",
    },

    "assets.realestate": {
      label: "Property & Land",
      helper:
        "Where the sale deed, mutation records, khata or patta, encumbrance certificate, society share certificate and property tax receipts are kept",
    },
    "assets.vehicles": {
      label: "Cars & Vehicles",
      helper:
        "Where the RC, insurance, PUC certificate, loan NOC and service records are kept for each vehicle",
    },
    "assets.valuables": {
      label: "Gold & Jewellery",
      helper:
        "Gold and silver, jewellery, heirlooms and artwork — what there is, where it is kept, and any valuation or purchase bills",
    },
    "assets.alternative": {
      label: "Other Investments",
      helper:
        "Chit funds, gold schemes, post office deposits, Kisan Vikas Patra, NSC, bonds or cryptocurrency",
    },

    "liabilities.tax": {
      label: "Tax & Legal Dues",
      helper:
        "Income tax matters (ITR filings, assessment or demand notices), property tax, GST, and any court or legal proceedings",
    },

    "family.ids": {
      label: "Aadhaar, PAN & Travel Papers",
      helper:
        "Where your Aadhaar, PAN, Voter ID, passport, driving licence, ration card and any OCI or PIO documents are kept",
    },

    "digital.services": {
      label: "Subscriptions & Services",
      helper:
        "UPI and payment apps, DigiLocker, cloud storage, and any software or streaming subscriptions",
    },
  },

  order: {
    // Nominations and the locker are what Indian families actually hunt for
    // first, so they lead their groups rather than trailing the tree order.
    banks: ["banks.accounts", "banks.nominees"],
    assets: ["assets.realestate", "assets.locker", "assets.valuables"],
  },

  additions: {
    banks: [
      {
        id: "banks.nominees",
        label: "Nominee Details",
        helper:
          "Who you have nominated on each bank account, insurance policy, demat account, EPF, PPF and NPS — and where the signed nomination forms are kept. Unclear nominations are the most common cause of family disputes",
        essential: true,
      },
    ],
    assets: [
      {
        id: "assets.locker",
        label: "Bank Locker",
        helper:
          "The bank and branch, the locker number, who is named as joint holder or nominee, where the key is kept, and what is inside",
        essential: true,
      },
    ],
  },
};
