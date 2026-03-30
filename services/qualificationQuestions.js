// services/qualificationQuestions.js
// ─────────────────────────────────────────────────────────────
// Shared qualification question flow used by both
// facebookMessenger.js and instagramService.js
//
// FLOW:
//   Q1: Tax debt or unfiled returns? (Yes/No/Not sure)
//       No → exit
//   Q2: Type of tax?
//       Income tax → proceed
//       Payroll tax → proceed
//       Sales/Use tax → exit (not our specialty)
//       Unemployment tax → exit (not our specialty)
//   Q3: IRS, state, or both?
//       (captured for form pre-fill)
//   Q4: How much do you owe?
//       (all ranges proceed — no disqualify)
//   Q5: What state are you in?
//   Q6: What's your first name?
//   → Send pre-filled qualify-now link
// ─────────────────────────────────────────────────────────────

const QUESTIONS = {
  q1_tax_issue: {
    text: "Hi there! 👋 I'm here to help you find out if you qualify for tax relief.\n\nDo you have a tax debt or unfiled tax returns?",
    quickReplies: [
      { title: "Yes", payload: "Q1_YES" },
      { title: "No", payload: "Q1_NO" },
      { title: "Not sure", payload: "Q1_NOTSURE" },
    ],
    next: (payload) => {
      if (payload === "Q1_NO") return "exit_no_issue";
      return "q2_tax_type";
    },
  },

  q2_tax_type: {
    text: "What type of tax is this related to?",
    quickReplies: [
      { title: "Income tax", payload: "Q2_INCOME" },
      { title: "Payroll tax", payload: "Q2_PAYROLL" },
      { title: "Sales/Use tax", payload: "Q2_SALES" },
      { title: "Unemployment tax", payload: "Q2_UNEMPLOYMENT" },
    ],
    next: (payload) => {
      if (payload === "Q2_SALES" || payload === "Q2_UNEMPLOYMENT")
        return "exit_wrong_type";
      return "q3_jurisdiction";
    },
    storeAs: "taxType",
    valueMap: {
      Q2_INCOME: "income",
      Q2_PAYROLL: "payroll",
      Q2_SALES: "sales",
      Q2_UNEMPLOYMENT: "unemployment",
    },
  },

  q3_jurisdiction: {
    text: "Is this tax issue with the IRS, a state tax agency, or both?",
    quickReplies: [
      { title: "IRS (federal)", payload: "Q3_IRS" },
      { title: "State", payload: "Q3_STATE" },
      { title: "Both", payload: "Q3_BOTH" },
    ],
    next: () => "q4_debt_amount",
    storeAs: "jurisdiction",
    valueMap: {
      Q3_IRS: "irs",
      Q3_STATE: "state",
      Q3_BOTH: "both",
    },
  },

  q4_debt_amount: {
    text: "Roughly how much do you owe in total?",
    quickReplies: [
      { title: "Under $10,000", payload: "Q4_UNDER10K" },
      { title: "$10k – $25k", payload: "Q4_10K_25K" },
      { title: "$25k – $50k", payload: "Q4_25K_50K" },
      { title: "$50k – $100k", payload: "Q4_50K_100K" },
      { title: "$100k+", payload: "Q4_OVER100K" },
    ],
    next: () => "q5_state",
    storeAs: "debtAmount",
    valueMap: {
      Q4_UNDER10K: "<10000",
      Q4_10K_25K: "10000-25000",
      Q4_25K_50K: "25000-50000",
      Q4_50K_100K: "50000-100000",
      Q4_OVER100K: ">100000",
    },
  },

  q5_state: {
    text: "What state are you in?",
    freeText: true,
    next: () => "q6_name",
    storeAs: "state",
  },

  q6_name: {
    text: "And what's your first name?",
    freeText: true,
    next: () => "send_link",
    storeAs: "name",
  },

  // ── Terminal states ────────────────────────────────────────

  exit_no_issue: {
    text: "No problem! If you ever have tax questions in the future, we're always here to help. 🙌",
    terminal: true,
  },

  exit_wrong_type: {
    text: "Thanks for sharing! We specialize in income and payroll tax issues with the IRS and state agencies. For sales/use or unemployment tax, we'd recommend reaching out to a specialist in that area. 🙌",
    terminal: true,
  },

  send_link: {
    terminal: true,
  },
};

// ─── Build Qualify URL ───────────────────────────────────────

function buildQualifyUrl(company, answers = {}, source = "messenger") {
  const isTAG = company === "TAG";
  const base = isTAG
    ? "https://www.taxadvocategroup.com/qualify-now"
    : "https://www.wynntaxsolutions.com/qualify-now";

  const params = new URLSearchParams();

  if (answers.name) params.set("name", answers.name);
  if (answers.state) params.set("state", answers.state);

  if (isTAG) {
    const TAG_DEBT_MAP = {
      "<10000": "under-10k",
      "10000-25000": "10k-50k",
      "25000-50000": "10k-50k",
      "50000-100000": "50k-100k",
      ">100000": "over-100k",
    };
    if (answers.debtAmount)
      params.set(
        "debtAmount",
        TAG_DEBT_MAP[answers.debtAmount] || answers.debtAmount,
      );
    if (answers.taxType)
      params.set(
        "taxType",
        answers.taxType === "payroll" ? "Business" : "Individual",
      );
    if (answers.jurisdiction)
      params.set(
        "debtType",
        answers.jurisdiction === "state" ? "State" : "Federal",
      );
  } else {
    if (answers.debtAmount) params.set("debtAmount", answers.debtAmount);
    if (answers.taxType) params.set("taxType", answers.taxType);
    if (answers.jurisdiction) params.set("jurisdiction", answers.jurisdiction);
  }

  params.set("nid", source);

  return `${base}/?${params.toString()}`;
}

// ─── Build Quick Replies ─────────────────────────────────────

function buildQuickReplies(options) {
  if (!options || !options.length) return undefined;
  return options.map((opt) => ({
    content_type: "text",
    title: opt.title,
    payload: opt.payload,
  }));
}

module.exports = { QUESTIONS, buildQualifyUrl, buildQuickReplies };
