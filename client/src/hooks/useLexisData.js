const useLexisData = () => {
  const extractAllPhones = (text) => {
    const phoneSummaryMatch = text.match(
      /Phone Summary\s*\(\d+\sphones\)([\s\S]*?)Licenses\/Voter/i
    );
    const phoneSection = phoneSummaryMatch ? phoneSummaryMatch[1] : text;
    const phoneRegex = /\b\d{3}-\d{3}-\d{4}\b/g;
    return [...new Set(phoneSection.match(phoneRegex) || [])];
  };

  const getLatestLien = (text) => {
    const lienBlocks = [
      ...text.matchAll(/(State|Federal) Tax Lien[\s\S]*?(?=Filing \d)/gi),
    ];

    const liens = [];

    for (const block of lienBlocks) {
      const section = block[0];

      const amountMatch = section.match(/\$(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/);
      const dateMatch = section.match(/\b(\d{2}\/\d{2}\/\d{4})\b/);
      const plaintiffMatch = section.match(/Creditor 1\s+([^\r\n]+)/i);

      if (amountMatch && dateMatch && plaintiffMatch) {
        liens.push({
          amount: parseInt(amountMatch[1].replace(/,/g, ""), 10),
          date: new Date(dateMatch[1]),
          rawDate: dateMatch[1],
          plaintiff: plaintiffMatch[1].trim(),
        });
      }
    }

    liens.sort((a, b) => b.date - a.date);
    return liens[0] || null;
  };

  const extractLeadFromText = (text) => {
    const phones = extractAllPhones(text); // ✅ Get all phones

    const lead = {
      First: "Unknown",
      Last: "Unknown",
      Address: "Unknown",
      City: "Unknown",
      State: "Unknown",
      "Lien Amount": 0,
      Plaintiff: "Unknown",
      phones, // ✅ Single phones field used everywhere
    };

    const addressRegex =
      /(\d{1,5} [A-Za-z\s]+(?:Street|St|Road|Rd|Avenue|Ave|Boulevard|Blvd|Highway|Hwy|Way|Drive|Dr|Lane|Ln|Court|Ct|Circle|Cir))[\r\n]+([\w\s]+),\s*([A-Z]{2})/;
    const addressMatch = text.match(addressRegex);
    if (addressMatch) {
      lead.Address = addressMatch[1].trim();
      lead.City = addressMatch[2].trim();
      lead.State = addressMatch[3].trim();
    }

    const latestLien = getLatestLien(text);
    console.log(latestLien, "latest");
    if (latestLien) {
      lead["Lien Amount"] = latestLien.amount;
      lead.Plaintiff = latestLien.plaintiff;
    }

    const nameMatch = text.match(/Phone\s+([A-Za-z ,.'-]+)/);
    if (nameMatch) {
      const nameParts = nameMatch[1].split(",");
      if (nameParts.length === 2) {
        lead.First = nameParts[1].trim();
        lead.Last = nameParts[0].trim();
      } else {
        const [first, ...rest] = nameMatch[1].trim().split(" ");
        lead.First = first;
        lead.Last = rest.join(" ");
      }
    }

    return lead;
  };

  const parseSingleLexisFile = async (file) => {
    if (!file) return null;
    const text = await file.text();
    const parsedLien = extractLeadFromText(text);
    return parsedLien;
  };

  const buildCSVData = (clients = []) => {
    const headers = [
      "First",
      "Last",
      "Address",
      "City",
      "State",
      "Lien Amount",
      "Plaintiff",
      "Phone",
    ];

    const rows = [];

    for (const client of clients) {
      const phones = client.phones || [];
      if (phones.length === 0) continue;

      // First row: full client info + first phone
      rows.push([
        client.First || "",
        client.Last || "",
        client.Address || "",
        client.City || "",
        client.State || "",
        client["Lien Amount"] || "",
        client.Plaintiff || "",
        phones[0], // first phone
      ]);

      // Subsequent rows: blank info + remaining phones
      for (let i = 1; i < phones.length; i++) {
        rows.push(["", "", "", "", "", "", "", phones[i]]);
      }
    }

    return [headers, ...rows];
  };

  return {
    parseSingleLexisFile,
    buildCSVData,
  };
};
export default useLexisData;
