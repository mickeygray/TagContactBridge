// Simple Tax Record Parser - Pure Functions Only
const useLexisData = () => {
  // Main parser function

  function cleanString(str) {
    if (typeof str !== "string") return "";
    // Remove non-printable/special characters, collapse spaces, trim
    return str
      .replace(/â€”/g, "") // Remove the specific mojibake you posted
      .replace(/â€“/g, "") // Remove short dash artifact
      .replace(/â€™/g, "'") // Replace curly apostrophe artifact
      .replace(/â€œ|â€�/g, '"') // Replace curly quote artifacts
      .replace(/[^\x20-\x7E]/g, "") // Remove most other non-ASCII except basic punctuation
      .replace(/\s+/g, " ") // Collapse multiple spaces
      .trim();
  }

  // Clean every string in an array
  function cleanStringArray(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.map(cleanString).filter(Boolean);
  }

  // Clean an array of objects by a key
  function cleanArrayOfObjects(arr, keys) {
    if (!Array.isArray(arr)) return [];
    return arr.map((obj) => {
      const cleaned = {};
      for (const key of keys) {
        cleaned[key] = cleanString(obj[key]);
      }
      return { ...obj, ...cleaned };
    });
  }

  function parseLexisRecord(text) {
    const parsed = {
      // Person info
      first: cleanString(extractFirstName(text)),
      last: cleanString(extractLastName(text)),
      dob: cleanString(extractDOB(text)),
      age: extractAge(text),
      sex: cleanString(extractSex(text)),
      ssn5: cleanString(extractSSN5(text)),
      lexID: cleanString(extractLexID(text)),

      // Family info
      hasSpouse: checkHasSpouse(text),
      spouseDeceased: checkSpouseDeceased(text),
      hasChildren: checkHasChildren(text),

      // Addresses
      ownedProperties: cleanArrayOfObjects(extractPropertyValuations(text), [
        "address",
        "city",
        "state",
        "zip",
      ]),

      // Tax liens
      taxLiens: extractTaxLiens(text),
      // Business info
      businessConnections: cleanArrayOfObjects(
        extractBusinessConnections(text),
        ["name", "address", "role"]
      ),
      possibleEmployers: cleanArrayOfObjects(extractPossibleEmployers(text), [
        "name",
        "address",
      ]),
      professionalLicenses: extractProfessionalLicenses(text),

      // Contact info
      phones: cleanStringArray(extractPhones(text)),
      emails: cleanStringArray(extractEmails(text)),
    };

    console.log(parsed);
    return parsed;
  }

  // Person info extractors
  function extractFirstName(text) {
    const nameMatch = text.match(
      /Person Summary[\s\S]*?Name\s*:?\s*\n?\s*([A-Za-z][A-Za-z\s,.'()-]+?)(?=\s{2,}|\n\s*[A-Z]|$)/i
    );
    if (!nameMatch) return "Unknown";

    const fullName = nameMatch[1].trim();
    if (fullName.includes(",")) {
      // Last, First format
      return fullName.split(",")[1].trim();
    }
    // First Last format
    return fullName.split(" ")[0];
  }

  function extractLastName(text) {
    const nameMatch = text.match(
      /Person Summary[\s\S]*?Name\s*:?\s*\n?\s*([A-Za-z][A-Za-z\s,.'()-]+?)(?=\s{2,}|\n\s*[A-Z]|$)/i
    );
    if (!nameMatch) return "Unknown";

    const fullName = nameMatch[1].trim();
    if (fullName.includes(",")) {
      // Last, First format
      return fullName.split(",")[0].trim();
    }
    // First Last format
    const parts = fullName.split(" ");
    return parts.slice(1).join(" ") || parts[0];
  }

  function extractDOB(text) {
    const dobMatch = text.match(/DOB\s*:?\s*(\d{1,2}\/\d{4})/i);
    return dobMatch ? dobMatch[1] : null;
  }

  function extractAge(text) {
    const ageMatch = text.match(/Age\s*:?\s*(\d{1,3})/i);
    return ageMatch ? parseInt(ageMatch[1]) : null;
  }

  function extractSex(text) {
    const sexMatch = text.match(/\((Male|Female)\)|Gender:\s*(Male|Female)/i);
    return sexMatch ? sexMatch[1] || sexMatch[2] : "Unknown";
  }

  function extractSSN5(text) {
    const ssnMatch = text.match(/SSN\s*:?\s*(\d{3}-\d{2})-XXXX/i);
    return ssnMatch ? ssnMatch[1] : null;
  }

  function extractLexID(text) {
    const lexMatch = text.match(/LexID\s*:?\s*(\d{4}-\d{4}-\d{4})/i);
    return lexMatch ? lexMatch[1] : null;
  }

  // Family info extractors
  function checkHasSpouse(text) {
    return /\(Possible\s+(Wife|Husband|Spouse)\)/i.test(text);
  }

  function checkSpouseDeceased(text) {
    const spouseSection = text.match(
      /\(Possible\s+(Wife|Husband|Spouse)\)([\s\S]*?)(?=\n\d+\.|$)/i
    );
    if (!spouseSection) return false;
    return /Deceased|DOD|Age at Death/i.test(spouseSection[2]);
  }

  function checkHasChildren(text) {
    return /\(Possible\s+(Son|Daughter|Child)\)/i.test(text);
  }

  // --- Get current OR bought/sold after 2020 ---
  function extractPropertyValuations(text) {
    const properties = [];
    console.log("=== [extractPropertyValuations] Start ===");

    // Find the *detailed* Real Property section (not the summary table)
    // This grabs everything from "Real Property (2 current, 8 prior)" through to "Personal Property" or end.
    const propSectionMatch = text.match(
      /Real Property \(\d+ current, \d+ prior\)[\s\S]+?(?=Personal Property|\n[A-Z][a-z]+ Profile|$)/i
    );

    if (!propSectionMatch) {
      console.log("[DEBUG] No Real Property section found.");
      return properties;
    }
    const propSection = propSectionMatch[0];
    console.log(
      "[DEBUG] Real Property section found. Length:",
      propSection.length
    );

    // Split by each property block (looks for newline + number + period + space)
    const blocks = propSection.split(/\n\d+\.\s+/).slice(1);
    console.log("[DEBUG] Split into property blocks. Count:", blocks.length);

    for (let blockIdx = 0; blockIdx < blocks.length; blockIdx++) {
      const block = blocks[blockIdx];
      // Lines per property
      const lines = block
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);

      // --- Owner Info ---
      let ownerLines = [];
      const ownerStart = lines.findIndex((l) => /^Owner Info$/i.test(l));
      const legalStart = lines.findIndex((l) => /^Legal Info$/i.test(l));
      if (ownerStart !== -1) {
        for (
          let i = ownerStart + 1;
          i < (legalStart === -1 ? lines.length : legalStart);
          i++
        ) {
          ownerLines.push(lines[i]);
        }
      }
      const owner = ownerLines.join("; ");

      // --- Legal Info ---
      let legalLines = [];
      if (legalStart !== -1) {
        for (
          let i = legalStart + 1;
          i < lines.length &&
          !/^Owner Info$/i.test(lines[i]) &&
          !/^\d+\./.test(lines[i]);
          i++
        ) {
          legalLines.push(lines[i]);
        }
      }

      // Extract fields from legalLines
      let assessmentYear = null,
        assessedValue = null,
        typeOfAddress = "",
        salePrice = null,
        parcelNumber = "";

      for (let l of legalLines) {
        if (/Assessment Year/i.test(l)) {
          const m = l.match(/Assessment Year:\s*(\d{4})/i);
          if (m) assessmentYear = parseInt(m[1]);
        }
        if (/Assessed Value/i.test(l)) {
          const m = l.match(/Assessed Value:\s*\$?([\d,]+\.\d{2})/i);
          if (m) assessedValue = parseFloat(m[1].replace(/,/g, ""));
        }
        if (/Type of Address/i.test(l)) {
          const m = l.match(/Type of Address:\s*(.+)/i);
          if (m) typeOfAddress = m[1].trim();
        }
        if (/Sale Price/i.test(l)) {
          const m = l.match(/Sale Price:\s*\$?([\d,]+\.\d{2})/i);
          if (m) salePrice = parseFloat(m[1].replace(/,/g, ""));
        }
        if (/Parcel Number/i.test(l)) {
          const m = l.match(/Parcel Number:\s*([^\s]+)/i);
          if (m) parcelNumber = m[1];
        }
      }

      // Only include if we have assessmentYear after 2020
      if (assessmentYear && assessmentYear >= 2021) {
        properties.push({
          owner,
          assessmentYear,
          assessedValue,
          typeOfAddress,
          salePrice,
          parcelNumber,
          // You can add address fields here later if needed
        });
      }
    }

    console.log(
      "=== [extractPropertyValuations] Done. Properties found:",
      properties.length,
      properties
    );
    return properties;
  }

  // Tax lien extractors
  function extractTaxLiens(text) {
    const liens = [];
    const releases = [];

    // Find lien section
    const lienSection = text.match(
      /Judgment\s*\/\s*Liens[\s\S]*?(?=\nUCC|Associates|$)/i
    );
    if (!lienSection) return liens;

    // Pattern to match lien entries
    const lienPattern =
      /(\d+)\.\s+(Federal Tax Lien|State Tax Lien|State Tax Warrant)(?:\s+Release)?\s+See Details\s+\$([\d,]+(?:\.\d{2})?)\s+(\d{2}\/\d{2}\/\d{4})/gi;

    let match;
    while ((match = lienPattern.exec(lienSection[0])) !== null) {
      const isRelease = /Release/i.test(match[0]);
      const type = match[2].includes("Federal") ? "Federal" : "State";
      const amount = parseFloat(match[3].replace(/,/g, ""));
      const date = match[4];
      const creditorIndex = lienSection.findIndex((line) =>
        /^Creditor\s*1\b/i.test(line.trim())
      );

      let plaintiff = "";
      if (creditorIndex !== -1 && creditorIndex + 1 < lienSection.length) {
        plaintiff = lienSection[creditorIndex + 1].trim();
      }
      const lienObj = {
        type: type,
        amount: amount,
        date: date,
        plaintiff:
          plaintiff ||
          (type === "Federal"
            ? "Internal Revenue Service"
            : "State Tax Authority"),
        status: isRelease ? "Release" : "Active",
      };

      if (isRelease) {
        releases.push({ type, amount });
      } else {
        liens.push(lienObj);
      }
    }

    // Filter out any liens that have a matching release by type & amount
    const unreleasedLiens = liens.filter((lien) => {
      return !releases.some(
        (rel) => rel.type === lien.type && rel.amount === lien.amount
      );
    });

    return unreleasedLiens;
  }

  // Business extractors
  function extractBusinessConnections(text) {
    const results = [];
    // Match section up to Possible Employers or end
    const section = text.match(
      /Business Connections[\s\S]*?(?=\nPossible Employers|\nProfessional Licenses|$)/i
    );
    if (!section) return results;
    // Extract block of records
    const block = section[0].split(/No\.\s+Name\s+Address\s+Title/i)[1];
    if (!block) return results;
    // Split by line that starts with digit dot
    const entries = block.split(/\n\d+\.\s+/).slice(1);

    for (const e of entries) {
      // Employer name: first line
      const lines = e
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const name = lines[0] || "";
      let address = "";
      let title = "";

      // Find address: lines after name and before possible title
      for (let i = 1; i < lines.length; i++) {
        if (
          /member|ucc|manager|owner|president|director|partner|shareholder|title/i.test(
            lines[i]
          )
        ) {
          title = lines[i];
          break;
        }
        address += (address ? " " : "") + lines[i];
      }
      // Remove junk whitespace
      results.push({ name, address: address.trim(), title: title.trim() });
    }
    return results;
  }

  function extractPossibleEmployers(text) {
    const results = [];
    // Match section up to next header or end
    const section = text.match(
      /Possible Employers[\s\S]*?(?=\nBusiness Associates|$)/i
    );
    if (!section) return results;
    // Extract block of records
    const block = section[0].split(/No\.\s+Name\s+Address\s+Phone/i)[1];
    if (!block) return results;
    const entries = block.split(/\n\d+\.\s+/).slice(1);

    for (const e of entries) {
      const lines = e
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const name = lines[0] || "";
      let address = "";
      let phone = "";
      let dateLastSeen = "";

      // Search for phone and address (look for 5-digit ZIP, then next line for phone)
      for (let i = 1; i < lines.length; i++) {
        if (/^\d{3}-\d{3}-\d{4}$/.test(lines[i]) || /^\d{10}$/.test(lines[i])) {
          phone = lines[i];
        } else if (/\d{5}/.test(lines[i])) {
          address += (address ? " " : "") + lines[i];
        } else if (/Date Last Seen:/i.test(lines[i])) {
          const d = lines[i].match(/Date Last Seen:\s*([^\n]+)/i);
          if (d) dateLastSeen = d[1].trim();
        } else if (
          address &&
          !phone &&
          lines[i] &&
          !lines[i].startsWith("Details")
        ) {
          // For addresses on multiple lines
          address += " " + lines[i];
        }
      }
      // Try to get Date Last Seen if missing
      if (!dateLastSeen) {
        for (let l of lines) {
          const d = l.match(/Date Last Seen:\s*([^\n]+)/i);
          if (d) dateLastSeen = d[1].trim();
        }
      }

      results.push({ name, address: address.trim(), phone, dateLastSeen });
    }
    return results;
  }

  function extractProfessionalLicenses(text) {
    const licenses = [];
    // Get section
    const sectionMatch = text.match(
      /Other Licenses[\s\S]+?(?=\nReal Property|$)/i
    );
    if (!sectionMatch) return licenses;
    const section = sectionMatch[0];

    // Split into numbered "Professional" blocks
    const blocks = section.split(/\n\d+\.\s+Professional/gi).slice(1);

    for (const block of blocks) {
      let issued = (block.match(/Issued:\s*([0-9/]+)/i) || [])[1] || null;
      let name = (block.match(/Personal Info\s*\n([^\n]+)/i) || [])[1] || "";
      if (!name) {
        const nm = block.match(/(Spinella[^\n]*)/i);
        if (nm) name = nm[1].trim();
      }

      // Grab everything after "License Info"
      const licStart = block.indexOf("License Info");
      let licenseType = "";
      let licenseNumber = "";
      let board = "";

      if (licStart !== -1) {
        // Get all lines after License Info
        const licLines = block
          .substring(licStart + "License Info".length)
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);

        for (const l of licLines) {
          if (/License No\./i.test(l)) {
            licenseNumber =
              (l.match(/License No\.\s*:\s*([A-Za-z0-9-]+)/i) || [])[1] || "";
          }
          if (/License Type:/i.test(l)) {
            licenseType =
              (l.match(/License Type\:\s*([^\n]+)/i) || [])[1] || "";
          }
          if (/Board:/i.test(l)) {
            board = (l.match(/Board\:\s*([^\n]+)/i) || [])[1] || "";
          }
        }
      }

      if (licenseType || licenseNumber || name || board || issued) {
        licenses.push({
          name,
          issued,
          licenseType: licenseType || "Unknown",
          licenseNumber,
          board: board || "Unknown",
        });
      }
    }
    function dedupeLicenses(licenses) {
      const seen = new Set();
      return licenses.filter((lic) => {
        if (seen.has(lic.licenseType.toLowerCase())) return false;
        seen.add(lic.licenseType.toLowerCase());
        return true;
      });
    }
    const uniqueLicenses = dedupeLicenses(licenses);
    return uniqueLicenses;
  }

  // Contact extractors
  function extractPhones(text) {
    const phones = new Set();

    // Multiple phone patterns
    const patterns = [
      /\b(\d{3})-(\d{3})-(\d{4})\b/g,
      /\((\d{3})\)\s*(\d{3})-(\d{4})/g,
      /\b(\d{3})\.(\d{3})\.(\d{4})\b/g,
    ];

    patterns.forEach((pattern) => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const phone = `${match[1]}-${match[2]}-${match[3]}`;
        phones.add(phone);
      }
    });

    return Array.from(phones);
  }

  function extractEmails(text) {
    const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi;
    const emails = new Set();

    let match;
    while ((match = emailPattern.exec(text)) !== null) {
      emails.add(match[0].toLowerCase());
    }

    return Array.from(emails);
  }

  // Build business contact list for CSV
  function buildBusinessContactList(validatedLienList) {
    return validatedLienList
      .filter((item) => {
        const hasContacts =
          (Array.isArray(item.phones) && item.phones.length > 0) ||
          (Array.isArray(item.emails) && item.emails.length > 0);

        const hasBiz =
          (Array.isArray(item.businessConnections) &&
            item.businessConnections.length > 0) ||
          (Array.isArray(item.possibleEmployers) &&
            item.possibleEmployers.length > 0) ||
          (Array.isArray(item.professionalLicenses) &&
            item.professionalLicenses.length > 0);

        return hasContacts && hasBiz;
      })
      .map((item) => ({
        caseNumber: item.caseNumber || "",
        name: item["First Name"] + " " + item["Last Name"] || "",
        lexID: item.lexID || "",
        businessConnections: item.businessConnections || [],
        possibleEmployers: item.possibleEmployers || [],
        professionalLicenses: item.professionalLicenses || [],
        phones: item.phones || [],
        emails: item.emails || [],
      }));
  }

  // Build summary text for Logics
  function buildSummaryText(client) {
    // Calculate lien totals
    const taxLiens = client.taxLiens;
    const federalLiens = taxLiens.filter((l) => l.type === "Federal");
    const stateLiens = taxLiens.filter((l) => l.type === "State");
    const totalLienAmount = taxLiens.reduce((sum, l) => sum + l.amount, 0);

    // Format businesses

    // Format liens
    const lienLines =
      taxLiens.length > 0
        ? taxLiens
            .map(
              (l) => `  - ${l.type} | $${l.amount.toLocaleString()} | ${l.date}`
            )
            .join("\n")
        : "  None";
    let businessConnText = "  None";
    if (client.businessConnections && client.businessConnections.length) {
      businessConnText = client.businessConnections
        .map(
          (b, i) =>
            `  ${i + 1}. ${b.name}${b.title ? " (" + b.title + ")" : ""}${
              b.address ? " — " + b.address : ""
            }`
        )
        .join("\n");
    }

    // Possible Employers
    let employerText = "  None";
    if (client.possibleEmployers && client.possibleEmployers.length) {
      employerText = client.possibleEmployers
        .map(
          (e, i) =>
            `  ${i + 1}. ${e.name} 
          ${e.dateLastSeen ? " (Last Seen: " + e.dateLastSeen + ")" : ""}`
        )
        .join("\n");
    }

    // Professional Licenses
    let licenseText = "  None";
    if (client.professionalLicenses && client.professionalLicenses.length) {
      licenseText = client.professionalLicenses
        .map(
          (l, i) =>
            `  ${i + 1}. ${l.licenseType || "License"}${
              l.licenseNumber ? " #" + l.licenseNumber : ""
            }${l.name ? " — " + l.name : ""}${
              l.issued ? " (Issued: " + l.issued + ")" : ""
            }${l.board ? " [" + l.board + "]" : ""}`
        )
        .join("\n");
    }

    return `
==============================
   CLIENT SUMMARY
==============================

DOB:          ${client.dob || "Unknown"} (Age: ${client.age || "Unknown"})
Sex:          ${client.sex}
LexID:        ${client.lexID || "Unknown"}
SSN (5):      ${client.ssn5 || "Unknown"}

-- Contact Info --
Phones: ${client.phones.join(", ") || "None"}
Emails: ${client.emails.join(", ") || "None"}

-- Tax Liens --
Federal:      ${federalLiens.length} ($${federalLiens
      .reduce((s, l) => s + l.amount, 0)
      .toLocaleString()})
State:        ${stateLiens.length} ($${stateLiens
      .reduce((s, l) => s + l.amount, 0)
      .toLocaleString()})
Total Amount: $${totalLienAmount.toLocaleString()}

Active Liens:
${lienLines}

-- Family --
Has Spouse:   ${client.hasSpouse ? "Yes" : "No"}${
      client.spouseDeceased ? " (Deceased)" : ""
    }
Has Children: ${client.hasChildren ? "Yes" : "No"}

-- Business Profile --
Business Connections:
${businessConnText}

Possible Employers:
${employerText}

Professional Licenses:
${licenseText.trim()}

-- Property Valuations (2021+ Assessed) --
${
  client.ownedProperties && client.ownedProperties.length > 0
    ? client.ownedProperties
        .map(
          (p, idx) =>
            `  ${idx + 1}. Owner: ${p.owner}
     Year: ${p.assessmentYear} | Type: ${p.typeOfAddress}
     Assessed: $${p.assessedValue?.toLocaleString() || "?"} | Sale: $${
              p.salePrice?.toLocaleString() || "?"
            }`
        )
        .join("\n")
    : "  None"
}

`.trim();
  }
  function buildEmailCsv(validatedLienList) {
    const rows = [];
    validatedLienList.forEach((item) => {
      if (!item.caseNumber) return;
      const emails = Array.isArray(item.emails) ? item.emails : [];
      if (emails.length === 0) {
        return;
      }
      emails.forEach((email, idx) => {
        rows.push({
          caseNumber: idx === 0 ? item.caseNumber : "",
          name: idx === 0 ? item["First Name"] + " " + item["Last Name"] : "",
          lienAmount: idx === 0 ? item.taxLiens?.[0]?.amount : "",
          plaintiff: idx === 0 ? item.taxLiens?.[0]?.plaintiff : "",
          email: email,
        });
      });
    });
    return rows;
  }
  function buildDialerCsv(validatedLienList) {
    const rows = [];
    validatedLienList.forEach((item) => {
      const phones = Array.isArray(item.phones) ? item.phones : [];
      if (!item.caseNumber) return;
      if (phones.length === 0) {
        return;
      }
      phones.forEach((phone, idx) => {
        rows.push({
          caseNumber: idx === 0 ? item.caseNumber : "",
          name: idx === 0 ? item["First Name"] + " " + item["Last Name"] : "",
          lienAmount: idx === 0 ? item.taxLiens?.[0]?.amount : "",
          plaintiff: idx === 0 ? item.taxLiens?.[0]?.plaintiff : "",
          phone: phone,
        });
      });
    });

    return rows;
  }

  const buildBusinessCsv = (businessList) => {
    return businessList.map((item) => {
      // Handle businessConnections
      const business =
        (item.businessConnections && item.businessConnections[0]) || {};
      // Handle possibleEmployers
      const employer =
        (item.possibleEmployers && item.possibleEmployers[0]) || {};
      // Handle professionalLicenses
      const license =
        (item.professionalLicenses && item.professionalLicenses[0]) || {};

      return {
        caseNumber: item.caseNumber || "",
        name: item["First Name"] + " " + item["Last Name"] || "",
        lexID: item.lexID || "",
        // Phones/Emails as semicolon-separated strings
        phones: Array.isArray(item.phones) ? item.phones.join("; ") : "",
        emails: Array.isArray(item.emails) ? item.emails.join("; ") : "",

        // Business Connection fields (always present, empty if no value)
        businessConnectionName: business.name || "",

        // Employer fields (always present, empty if no value)
        employerName: employer.name || "",
        employerLastSeen: employer.lastSeen || "",

        // Professional License fields (always present, empty if no value)
        licenseType: license.type || "",
        licenseBoard: license.board || "",
      };
    });
  };

  return {
    parseLexisRecord,
    buildBusinessContactList,
    buildSummaryText,
    buildDialerCsv,
    buildBusinessCsv,
    buildEmailCsv,
  };
};
export default useLexisData;
