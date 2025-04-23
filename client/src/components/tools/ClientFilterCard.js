import React, { useState, useContext } from "react";
import ListContext from "../../context/list/listContext";

const ClientFilterCard = ({ clients }) => {
  const { runClientEnrichment } = useContext(ListContext);
  const [filters, setFilters] = useState({
    invoiceMin: 0,
    invoiceMax: -2000,
    invoiceCutoff: "",
    activityCutoff: "",
    paymentCeiling: "",
    tierGroup: "all",
    stage: "", // ✅ Add stage selector
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFilters({ ...filters, [name]: value });
  };

  const scrubClients = () => {
    const {
      invoiceMin,
      invoiceMax,
      invoiceCutoff,
      activityCutoff,
      paymentCeiling,
      tierGroup,
      stage,
    } = filters;

    if (!stage) {
      alert("⚠️ Please select a stage before enriching clients.");
      return;
    }

    const cleaned = clients.filter((client) => {
      const invoiceAmount = parseFloat(client["Last Invoice Amount"] || 0);
      const invoiceDate = new Date(client["Last Invoice Date"]);
      const activityDate = new Date(
        client["Last Activity Date"] || client["Last Modified Date"]
      );
      const totalPayments = parseFloat(client["Total Payments"] || 0);
      const status = client.Status || "";

      if (invoiceAmount === invoiceMin || invoiceAmount < invoiceMax)
        return false;
      if (invoiceCutoff && invoiceDate > new Date(invoiceCutoff)) return false;
      if (activityCutoff && activityDate < new Date(activityCutoff))
        return false;
      if (paymentCeiling && totalPayments > parseFloat(paymentCeiling))
        return false;

      if (tierGroup === "tier34") {
        return status.includes("TIER 3") || status.includes("TIER 4");
      }
      if (tierGroup === "tier12") {
        return (
          status.includes("TIER 1") ||
          status.includes("TIER 2") ||
          (!status.includes("TIER 3") &&
            !status.includes("TIER 4") &&
            !status.includes("TIER 5"))
        );
      }

      return true;
    });

    const enrichedWithStage = cleaned.map((c) => ({
      ...c,
      stage,
    }));

    console.log("✅ Filtered + staged clients:", enrichedWithStage);
    runClientEnrichment(enrichedWithStage);
  };

  return (
    <div className="card">
      <h4>📊 Filter Clients</h4>
      <div className="grid-2">
        <p>Last Invoice Date Cut Off</p>
        <input
          type="date"
          name="invoiceCutoff"
          value={filters.invoiceCutoff}
          onChange={handleChange}
        />
        <p>Last Activity Date Cut Off</p>
        <input
          type="date"
          name="activityCutoff"
          value={filters.activityCutoff}
          onChange={handleChange}
        />
        <p>Max Payment Cutoff</p>
        <input
          type="number"
          name="paymentCeiling"
          value={filters.paymentCeiling}
          onChange={handleChange}
        />
        <p>Tier Sort</p>
        <select
          name="tierGroup"
          value={filters.tierGroup}
          onChange={handleChange}
        >
          <option value="all">All Tiers</option>
          <option value="tier34">Tier 3 & 4</option>
          <option value="tier12">Tier 1, 2 & Other</option>
        </select>

        {/* ✅ Stage Selector */}
        <p>Stage (Required)</p>
        <select name="stage" value={filters.stage} onChange={handleChange}>
          <option value="">– Select a Stage –</option>
          <option value="taxOrganizer">Tax Organizer</option>
          <option value="taxDeadline">Tax Deadline</option>
          <option value="penaltyAbatement">Penalty Abatement</option>
          <option value="yearReview">Yearly Review</option>
          <option value="update433a">433a Update</option>
        </select>
      </div>
      <button className="btn btn-outline mt-2" onClick={scrubClients}>
        Filter Now
      </button>
    </div>
  );
};

export default ClientFilterCard;
