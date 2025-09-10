const plaintiffStateMatch = ["Match", "State Match", "Mismatch", "Federal"];

const lienType = ["State", "Federal"];

const plaintiffs = [
  "STATE OF KANSAS",
  "INTERNAL REVENUE SERVICE",
  "STATE OF NEW YORK",
  "STATE OF OKLAHOMA",
  "STATE OF IOWA",
  "STATE OF CALIFORNIA",
  "STATE OF MARYLAND",
  "STATE OF SOUTH CAROLINA",
  "STATE OF INDIANA",
  "STATE OF NEW MEXICO",
  "STATE OF DISTRICT OF COLUMBIA",
  "STATE OF ARKANSAS",
  "STATE OF WISCONSIN",
  "STATE OF ALABAMA",
  "STATE OF MICHIGAN",
  "STATE OF UTAH",
  "STATE OF MASSACHUSETTS",
  "STATE OF PENNSYLVANIA",
  "STATE OF MAINE",
  "STATE OF ILLINOIS",
  "STATE OF WEST VIRGINIA",
  "STATE OF GEORGIA",
  "STATE OF CONNECTICUT",
  "STATE OF OHIO",
  "STATE OF OREGON",
  "STATE OF MISSISSIPPI",
  "STATE OF NEW JERSEY",
  "STATE OF IDAHO",
  "STATE OF HAWAII",
  "STATE OF MONTANA",
  "STATE OF WYOMING",
  "STATE OF WASHINGTON",
  "STATE OF VIRGINIA",
  "STATE OF TEXAS",
  "STATE OF TENNESSEE",
  "State Of South Dakota",
  "STATE OF NORTH DAKOTA",
  "STATE OF NORTH CAROLINA",
  "STATE OF NEW HAMPSHIRE",
  "STATE OF NEVADA",
  "STATE OF NEBRASKA",
  "STATE OF MINNESOTA",
  "STATE OF LOUISIANA",
  "STATE OF KENTUCKY",
  "STATE OF FLORIDA",
  "STATE OF DELAWARE",
  "STATE OF COLORADO",
  "STATE OF ARIZONA",
  "State Of Alaska",
];

const states = [
  "KS",
  "MO",
  "NY",
  "IA",
  "CA",
  "OK",
  "MD",
  "IN",
  "MS",
  "SC",
  "NM",
  "AK",
  "AZ",
  "TX",
  "DC",
  "FL",
  "AR",
  "WI",
  "MN",
  "AL",
  "MI",
  "UT",
  "IL",
  "MA",
  "PA",
  "ME",
  "WV",
  "CT",
  "GA",
  "OH",
  "NJ",
  "ID",
  "HI",
  "WY",
  "VA",
  "NC",
  "CO",
  "PR",
  "NE",
  "RI",
  "NV",
  "LA",
  "TN",
  "KY",
  "OR",
  "WA",
  "AE",
  "DE",
  "MT",
  "NH",
  "VT",
  "SD",
  "ND",
  "AP",
  "GU",
  "VI",
];

const amountRange = ["50–100k", "10–25k", "0–10k", "25–50k", "100k+"];

const age = ["3months", "1month", "2weeks", "1year", "1yearplus", "6months"];

function generateTypeAmountCombos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dataSheet = ss.getSheetByName("FormattedDataSheet");
  let outputSheet = ss.getSheetByName("ComboSheet");

  // Column headers (adjust if column order changes)
  const headers = dataSheet
    .getRange(1, 1, 1, dataSheet.getLastColumn())
    .getValues()[0];
  const lienTypeCol = headers.indexOf("Same State");
  const ageRangeCol = headers.indexOf("AgeRange");
  const costCol = headers.indexOf("Cost");
  const initialCol = headers.indexOf("Initial Payment");
  const totalPayCol = headers.indexOf("Total Payments");
  const grossSaleCol = headers.indexOf("Gross Sale");
  const hasCallCol = headers.indexOf("Has Call");
  const hasQuoteCol = headers.indexOf("Has Quote");
  const hasDealCol = headers.indexOf("Has Deal");
  const hasPIFCol = headers.indexOf("Has PIF");
  const hasUpsellQuoteCol = headers.indexOf("Has Upsell Quote");
  const hasUpsellPaymentCol = headers.indexOf("Has Upsell Payments");

  const data = dataSheet
    .getRange(2, 1, dataSheet.getLastRow() - 1, dataSheet.getLastColumn())
    .getValues();

  const plaintiffStateMatch = ["Match", "State Match", "Mismatch", "Federal"];
  const age = ["3months", "1month", "2weeks", "1year", "1yearplus", "6months"];

  const results = [];

  plaintiffStateMatch.forEach((type) => {
    age.forEach((range) => {
      let count = 0;
      let costTotal = 0;
      let initialTotal = 0;
      let totalPayments = 0;
      let grossSale = 0;
      let calls = 0;
      let quotes = 0;
      let deals = 0;
      let pifs = 0;
      let upsellQuotes = 0;
      let upsellPayments = 0;

      data.forEach((row) => {
        const rowType = row[lienTypeCol];
        const rowRange = row[ageRangeCol];

        if (rowType === type && rowRange === range) {
          count++;
          costTotal += Number(row[costCol]) || 0;
          initialTotal += Number(row[initialCol]) || 0;
          totalPayments += Number(row[totalPayCol]) || 0;
          grossSale += Number(row[grossSaleCol]) || 0;
          calls += row[hasCallCol] === 1 ? 1 : 0;
          quotes += row[hasQuoteCol] === 1 ? 1 : 0;
          deals += row[hasDealCol] === 1 ? 1 : 0;
          pifs += row[hasPIFCol] === 1 ? 1 : 0;
          upsellQuotes += row[hasUpsellQuoteCol] === 1 ? 1 : 0;
          upsellPayments += row[hasUpsellPaymentCol] === 1 ? 1 : 0;
        }
      });

      const label = `${type} – ${range}`;
      results.push([
        label,
        count,
        costTotal,
        initialTotal,
        totalPayments,
        grossSale,
        calls,
        quotes,
        deals,
        pifs,
        upsellQuotes,
        upsellPayments,
      ]);
    });
  });

  // Output headers and results
  if (!outputSheet) {
    outputSheet = ss.insertSheet("ComboSheet");
  } else {
    outputSheet.clear(); // Clear existing contents if the sheet exists
  }

  outputSheet.appendRow([
    "Label", // This is now the unique name
    "Count",
    "Total Cost",
    "Total Initial",
    "Total Payments",
    "Gross Sale",
    "Calls",
    "Quotes",
    "Deals",
    "PIFs",
    "Upsell Quotes",
    "Upsell Payments",
  ]);

  outputSheet
    .getRange(2, 1, results.length, results[0].length)
    .setValues(results);
}

function createComboDerivedValues() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("ComboSheet");

  const dataRange = sheet.getRange(
    2,
    1,
    sheet.getLastRow() - 1,
    sheet.getLastColumn()
  );
  const data = dataRange.getValues();

  const updated = data.map((row) => {
    const count = row[1];
    const totalCost = row[2];
    const totalInitial = row[3];
    const totalPay = row[4];
    const grossSale = row[5];
    const calls = row[6];
    const quotes = row[7];
    const deals = row[8];
    const pifs = row[9];
    const usq = row[10];
    const usp = row[11];

    const ROI = totalPay !== 0 ? (totalPay - totalCost) / totalCost : 0;
    const CPL = calls !== 0 ? totalCost / calls : 0;
    const CPC = deals !== 0 ? totalCost / deals : 0;
    const INITIAL = totalCost !== 0 ? totalInitial / totalCost : 0;

    const openRate = count !== 0 ? calls / count : 0;
    const quoteRate = count !== 0 ? quotes / count : 0;
    const closeRate = count !== 0 ? deals / count : 0;
    const pifRate = count !== 0 ? pifs / count : 0;
    const usqRate = count !== 0 ? usq / count : 0;
    const uspRate = count !== 0 ? usp / count : 0;

    const attrition = 0.181818;

    return [
      ...row,
      ROI,
      CPL,
      CPC,
      INITIAL,
      openRate,
      quoteRate,
      closeRate,
      pifRate,
      usqRate,
      uspRate,
      attrition,
    ];
  });

  // Append new headers
  const headers = [
    "ROI",
    "CPL",
    "CPC",
    "INITIAL",
    "Open Rate",
    "Quote Rate",
    "Close Rate",
    "PIF Rate",
    "USQ Rate",
    "USP Rate",
    "Attrition",
  ];
  const startCol = sheet.getLastColumn() + 1;
  sheet.getRange(1, startCol, 1, headers.length).setValues([headers]);
  sheet
    .getRange(2, startCol, updated.length, headers.length)
    .setValues(updated.map((row) => row.slice(-headers.length)));
}

function scoreCombos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const outputSheet = ss.getSheetByName("ComboSheet");
  const data = outputSheet
    .getRange(2, 1, outputSheet.getLastRow() - 1, outputSheet.getLastColumn())
    .getValues();

  // Ideal reference values
  const idealROI = 3;
  const idealInitial = 1;
  const idealOrigination = 0.55;
  const idealMonetization = 0.32;
  const idealTotal = 0.87;

  const results = [];

  data.forEach((row) => {
    const initial = row[3];
    const total = row[4]; // D - Initial
    const cpl = row[13];
    const cpc = row[14]; // N - CPL
    const deals = row[8]; // I - Deals
    const quoteRate = row[17];
    const openRate = row[16]; // R
    const closeRate = row[18]; // S
    const pifRate = row[19];
    const usqRate = row[20];
    const uspRate = row[21]; // T
    const roi = row[12]; // M
    const initialRate = row[15];
    const attrition = row[22]; // P

    const safeDiv = (a, b) => (b === 0 ? 0 : a / b);

    const funnelScore =
      safeDiv(quoteRate, openRate) * 0.69 +
      safeDiv(closeRate, quoteRate) * 0.15 +
      safeDiv(pifRate, closeRate) * 0.16;

    const originationScore =
      safeDiv((initial - cpl * deals) * funnelScore, initial) *
      safeDiv(initialRate, idealInitial) *
      2;
    const funnelMultiplier =
      safeDiv(closeRate, quoteRate) * 0.8 +
      safeDiv(usqRate + uspRate, quoteRate) * 0.2;

    const monetizationScore =
      safeDiv((total - cpc * deals) * funnelMultiplier, total) *
      (1 - attrition) *
      safeDiv(roi + 1, idealROI);
    const totalScore = originationScore + monetizationScore;
    const deltaOrig = originationScore - idealOrigination;
    const deltaMone = monetizationScore - idealMonetization;
    const deltaTotal = totalScore - idealTotal;

    results.push([
      originationScore,
      monetizationScore,
      totalScore,
      deltaOrig,
      deltaMone,
      deltaTotal,
    ]);
  });
  const headers = [
    "Origination",
    "Monetization",
    "Total Score",
    "Orig Diff",
    "Mone Diff",
    "Total Diff",
  ];

  // X = 24 (A=1, so X is column 24)
  outputSheet.getRange(1, 24, 1, headers.length).setValues([headers]);
  outputSheet
    .getRange(2, 24, results.length, results[0].length)
    .setValues(results);
}

function generateAllComboMetrics() {
  generateTypeAmountCombos();
  createComboDerivedValues();
  scoreCombos();
}

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu("🔧 Combo Tools")
    .addItem("Generate All Combo Metrics", "generateAllComboMetrics")
    .addToUi();
}
