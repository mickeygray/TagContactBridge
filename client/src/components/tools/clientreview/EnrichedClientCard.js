// EnrichedClientCard.jsx
import React, { useContext } from "react";
import ClientContext from "../../../context/client/clientContext";
import CollapsibleNote from "../../layout/CollapsibleNote";

export default function EnrichedClientCard({ client, onHide }) {
  const { enrichedClient } = client;
  const { postZeroInvoice } = useContext(ClientContext);

  const handleZeroInvoice = async () => {
    try {
      await postZeroInvoice(enrichedClient.caseNumber);
      // Optionally show a toast here
    } catch (err) {
      console.error("Zero‐invoice failed:", err);
      // Optionally show an error toast here
    }
  };
  console.log(enrichedClient, "enrichedClientCard");
  return (
    <div className="card enriched-card mb-2">
      {/* Hide details */}
      <div className="card-actions top-right">
        <button onClick={onHide} className="btn btn-sm btn-outline">
          Hide
        </button>
      </div>

      {/* Header info */}
      <div className="card-body">
        <h3 className="card-title">
          {enrichedClient.name || enrichedClient.caseNumber}
        </h3>
        <p>
          <strong>Case #:</strong> {enrichedClient.caseNumber}
        </p>
        <p>
          <strong>Status:</strong> {enrichedClient.status}
        </p>
      </div>

      {/* 1️⃣ Billing Summary */}
      <section className="card-section">
        <h4>💳 Billing Summary</h4>
        {enrichedClient.billingSummary ? (
          <ul>
            <li>Total Fees: ${enrichedClient.billingSummary.TotalFees}</li>
            <li>Paid Amount: ${enrichedClient.billingSummary.PaidAmount}</li>
            <li>Balance: ${enrichedClient.billingSummary.Balance}</li>
            <li>Past Due: ${enrichedClient.billingSummary.PastDue}</li>
          </ul>
        ) : (
          <p>No billing summary loaded.</p>
        )}
      </section>

      {/* 2️⃣ Invoices */}
      <section className="card-section">
        <h4>📑 Invoices</h4>
        {Array.isArray(enrichedClient.invoices) &&
        enrichedClient.invoices.length > 0 ? (
          <ul>
            {enrichedClient.invoices.map((inv, idx) => (
              <li key={idx}>
                <strong>
                  {new Date(inv.Date || inv.CreatedDate).toLocaleDateString()}
                </strong>{" "}
                — ${inv.UnitPrice ?? inv.Amount} —{" "}
                {inv.Description || inv.Subject}
              </li>
            ))}
          </ul>
        ) : (
          <p>No invoices loaded.</p>
        )}
      </section>

      {/* 3️⃣ Activities */}
      <section className="card-section">
        <h4>📋 Activities</h4>
        {Array.isArray(enrichedClient.filteredActivities) &&
        enrichedClient.filteredActivities.length > 0 ? (
          enrichedClient.filteredActivities.map((act, idx) => (
            <CollapsibleNote key={idx} act={act} />
          ))
        ) : (
          <p>No activities loaded.</p>
        )}
      </section>

      {/* 4️⃣ Tasks */}
      <section className="card-section">
        <h4>🗒️ Tasks</h4>
        {Array.isArray(enrichedClient.tasks) &&
        enrichedClient.tasks.length > 0 ? (
          <ul>
            {enrichedClient.tasks
              .filter((t) => !t.Deleted)
              .map((t, idx) => (
                <li key={idx}>
                  <strong>
                    Created by {t.CreatedByName} on{" "}
                    {new Date(t.CreateDate || t.DueDate).toLocaleDateString()}
                  </strong>{" "}
                  — {t.Subject} (Due: {new Date(t.DueDate).toLocaleDateString()}
                  , Last Reminder:{" "}
                  {new Date(t.LastReminded).toLocaleDateString()})
                </li>
              ))}
          </ul>
        ) : (
          <p>No tasks loaded.</p>
        )}
      </section>

      {/* Footer actions */}
      <div className="card-actions">
        <button className="btn btn-sm btn-outline" onClick={handleZeroInvoice}>
          Zero Invoice
        </button>
      </div>
    </div>
  );
}
