import React, { useReducer } from "react";
import axios from "axios";
import ClientContext from "./clientContext";
import clientReducer from "./clientReducer";

const ClientState = (props) => {
  const initialState = { enrichedClients: [] };

  const [state, dispatch] = useReducer(clientReducer, initialState);
  /*
  // ✅ Upload TXT Files to state (but don't process yet)
  const uploadTXTs = (files) => {
    dispatch({ type: "UPLOAD_TXTS", payload: files });
  };

  // ✅ Start Processing a Few TXT Files at a Time
  const processBatch = async () => {
    const batchSize = 100; // Controls how many files are processed at once

    // 🟡 Take `batchSize` files from `txtFiles` and move to `scrapingQueue`
    const processingBatch = state.txtFiles.slice(0, batchSize);
    dispatch({ type: "MOVE_TO_SCRAPING", payload: processingBatch });

    const extractedLeads = [];
    for (const file of processingBatch) {
      const text = await file.text();

      // ✅ Extract Name, Address, County, Phone from "Person Summary"
      const extractLeadData = (text) => {
        console.log("📝 Raw Input Text:", text); // Debugging raw input

        let extractedLead = {
          name: "Unknown",
          address: "Unknown",
          phone: "N/A",
          emails: [],
        };

        // ✅ Extract Emails
        const emailRegex =
          /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
        const emailsMatch = text.match(emailRegex);
        extractedLead.emails = emailsMatch
          ? emailsMatch.map((email) => email.trim())
          : [];

        // ✅ Step 1: Find Name (first thing after "County")
        const countyMatch = text.match(/Phone\s+([A-Za-z\s,.-]+)/);
        if (countyMatch) {
          extractedLead.name = countyMatch[1].trim();
          const nameParts = extractedLead.name.split(", ");
          if (nameParts.length === 2) {
            extractedLead.name = `${nameParts[1]} ${nameParts[0]}`.trim();
          }

          text = text.substring(
            text.indexOf(countyMatch[1]) + countyMatch[1].length
          );
        }
        const addressRegex =
          /(\d{1,5} [A-Za-z\s-]+(?:Street|St|Road|Rd|Avenue|Ave|Boulevard|Blvd|Highway|Hwy|Way|Drive|Dr|Lane|Ln|Court|Ct|Circle|Cir))\s*(?:[\r\n]+)?([\w\s]+),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?/;
        const addressMatch = text.match(addressRegex);

        if (addressMatch) {
          extractedLead.address = addressMatch[1].trim();
        }
        // ✅ Step 2: Find Address (first number followed by 2 words)

        // ✅ Step 3: Find Street Name (ending in Street, Road, Hwy, Blvd, etc.)

        // ✅ Step 5: Find Phone Number (format XXX-XXX-XXXX)
        const phoneRegex = /\b\d{3}-\d{3}-\d{4}\b/;
        const phoneMatch = text.match(phoneRegex);
        if (phoneMatch) {
          extractedLead.phone = phoneMatch[0];
          text = text.substring(
            text.indexOf(phoneMatch[0]) + phoneMatch[0].length
          );
        }

        // ✅ Step 6: Find City (word(s) between phone and next comma)

        // ✅ Step 7: Find State (2-letter abbreviation)

        // ✅ Step 8: Find Zip Code (XXXXX-XXXX or XXXXX format)

        console.log("📋 Final Extracted Lead:", extractedLead);
        return extractedLead;
      };

      // Run the function
      const leadData = extractLeadData(text);
      console.log("🏁 Lead Data Output:", leadData);

      const phoneSummaryMatch = text.match(
        /Phone Summary\s*\(\d+\sphones\)([\s\S]*?)Licenses\/Voter/i
      );

      console.log(phoneSummaryMatch, "phone summary match");
      const phoneSection = phoneSummaryMatch ? phoneSummaryMatch[1] : "";

      const simplePhoneRegex = /(\d{3}-\d{3}-\d{4})/g;
      const phoneNumbers = phoneSection.match(simplePhoneRegex) || [];

      console.log("📞 Extracted Phone Numbers:", phoneNumbers);

      // ✅ Extract Tax Liens
      const taxLiens = [];
      const federalDebtRegex = /Federal Tax Lien.*?\$(\d{1,3}(?:,\d{3})*)/g;
      const stateDebtRegex = /State Tax Lien.*?\$(\d{1,3}(?:,\d{3})*)/g;

      let federalDebt = 0;
      let stateDebt = 0;
      let match;

      // ✅ Extract Federal Tax Liens
      while ((match = federalDebtRegex.exec(text)) !== null) {
        const fullSection = text.substring(
          match.index,
          text.indexOf("Debtor 1", match.index) || text.length
        );

        const amount = parseInt(match[1].replace(/,/g, ""), 10);

        // ✅ Extract Filing Date (MM/DD/YYYY)
        const dateMatch = fullSection.match(/\b\d{2}\/\d{2}\/\d{4}\b/);
        const filingDate = dateMatch ? dateMatch[0] : "Unknown";

        // ✅ Extract Creditor Name (between Filing Date and "Filing")
        const creditorStartIndex = text.indexOf(filingDate) + filingDate.length;
        const creditorEndIndex = text.indexOf("Filing", creditorStartIndex);
        const creditorSection = text.substring(
          creditorStartIndex,
          creditorEndIndex
        );

        const creditorMatch = creditorSection.match(/Creditor 1\s+([^\n]+)/);
        const creditor = creditorMatch ? creditorMatch[1].trim() : "Unknown";

        taxLiens.push({
          type: "Federal",
          amount,
          filingDate,
          creditor,
        });

        federalDebt += amount;
      }

      // ✅ Extract State Tax Liens
      while ((match = stateDebtRegex.exec(text)) !== null) {
        const fullSection = text.substring(
          match.index,
          text.indexOf("Debtor 1", match.index) || text.length
        );

        const amount = parseInt(match[1].replace(/,/g, ""), 10);

        // ✅ Extract Filing Date (MM/DD/YYYY)
        const dateMatch = fullSection.match(/\b\d{2}\/\d{2}\/\d{4}\b/);
        const filingDate = dateMatch ? dateMatch[0] : "Unknown";

        // ✅ Extract Creditor Name
        const creditorStartIndex = text.indexOf(filingDate) + filingDate.length;
        const creditorEndIndex = text.indexOf("Filing", creditorStartIndex);
        const creditorSection = text.substring(
          creditorStartIndex,
          creditorEndIndex
        );

        const creditorMatch = creditorSection.match(/Creditor 1\s+([^\n]+)/);
        const creditor = creditorMatch ? creditorMatch[1].trim() : "Unknown";

        taxLiens.push({
          type: "State",
          amount,
          filingDate,
          creditor,
        });

        stateDebt += amount;
      }

      // ✅ Create Lead Object
      const lead = {
        fileName: file.name, // Store original file name for tracking
        ...leadData, // Array of extracted emails
        phoneNumbers,
        taxLiens,
        stateDebt,
        federalDebt,
      };

      extractedLeads.push(lead);
    }

    // 🟢 Move files from `scrapingQueue` to `extractedLeads`
    dispatch({ type: "EXTRACT_LEADS", payload: extractedLeads });
  };

  // ✅ Remove a single file before upload
  const removeFile = (index) => {
    dispatch({ type: "REMOVE_FILE", payload: index });
  };

  // ✅ Scrub Extracted Leads
  const scrubLeads = async () => {
    try {
      const res = await axios.post("/api/clients/scrub", {
        leads: state.extractedLeads,
      });
      dispatch({ type: "SCRUB_LEADS", payload: res.data.scrubbedLeads });
    } catch (error) {
      console.error("❌ Scrubbing Failed:", error);
    }
  };
*/
  const uploadFileToCase = async ({ file, caseID }) => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("caseID", caseID);

      await axios.post("/api/clients/uploadDocument", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      console.log("File uploaded to Logics");
    } catch (err) {
      console.error("Upload failed:", err);
    }
  };
  const postZeroInvoice = async (caseID) => {
    try {
      const res = await axios.post("/api/list/zeroInvoice", { caseID });
      console.log("✅ Zero invoice posted:", res.data);
    } catch (err) {
      console.error("❌ Error posting zero invoice:", err);
    }
  };

  const runClientEnrichment = async (clientList) => {
    try {
      const res = await axios.post(
        "/api/list/enrichClients",
        { clientList },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      dispatch({
        type: "SET_CLIENT_LIST",
        payload: res.data.enrichedClients, // should be an array of enriched clients
      });

      console.log("✅ Enriched Clients Received:", res.data);
    } catch (error) {
      console.error(
        "❌ Error enriching clients:",
        error.response?.data || error.message
      );
      alert(
        "There was an error enriching the clients. Please try again later."
      );
    }
  };
  const addScheduledClient = async (clientData) => {
    try {
      const res = await axios.post("/api/schedule", clientData);
      dispatch({ type: "ADD_SCHEDULED_CLIENT", payload: res.data });
    } catch (error) {
      console.error("❌ Error adding client:", error);
    }
  };

  // Update scheduled client
  const updateScheduledClient = async (id, updates) => {
    try {
      const res = await axios.put(`/api/schedule/${id}`, updates);
      dispatch({ type: "UPDATE_SCHEDULED_CLIENT", payload: res.data });
    } catch (error) {
      console.error("❌ Error updating client:", error);
    }
  };

  // Delete scheduled client
  const deleteScheduledClient = async (id) => {
    try {
      await axios.delete(`/api/schedule/${id}`);
      dispatch({ type: "DELETE_SCHEDULED_CLIENT", payload: id });
    } catch (error) {
      console.error("❌ Error deleting client:", error);
    }
  };
  return (
    <ClientContext.Provider
      value={{
        enrichedClients: state.enrichedClients,
        uploadFileToCase,
        postZeroInvoice,
        runClientEnrichment,
        addScheduledClient,
        updateScheduledClient,
        deleteScheduledClient,
      }}
    >
      {props.children}
    </ClientContext.Provider>
  );
};

export default ClientState;
