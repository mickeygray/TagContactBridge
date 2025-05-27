import React, { useState, useContext } from "react";
import PropTypes from "prop-types";
import ClientContext from "../../context/client/clientContext";
import CollapsibleNote from "../layout/CollapsibleNote";

export default function ClientAnalysisCard({
  client,
  actions,
  onReview,
  onSkip,
  onZeroInvoice,
}) {
  const { name, caseNumber, email, cell, domain, reviewMessages = [] } = client;

  const {
    enrichClient,
    enrichedClient,
    deleteScheduledClient,
    clearEnrichedClient,
  } = useContext(ClientContext);

  const [showEnriched, setShowEnriched] = useState(false);

  const handleEnrich = async () => {
    try {
      await enrichClient(client);
    } catch (err) {
      console.error("Failed to enrich client:", err);
    }
  };

  const handleClearEnrich = async () => {
    try {
      clearEnrichedClient();
    } catch (err) {
      console.error("Failed to enrich client:", err);
    }
  };
  return (
    <div className="card border p-4 shadow-sm mb-4">
      {/* Header */}
      <h5 className="font-semibold mb-2">{name || caseNumber}</h5>
      <p>
        <strong>Case #:</strong> {caseNumber}
      </p>
      <p>
        <strong>Email:</strong> {email || "N/A"}
      </p>
      <p>
        <strong>Cell:</strong> {cell || "N/A"}
      </p>
      <p>
        <strong>Domain:</strong> {domain}
      </p>
      {reviewMessages.map((msg, i) => (
        <p key={i} className="mt-2 text-sm text-red-600">
          ⚠️ {msg}
        </p>
      ))}

      {/* Primary actions */}
      <div className="mt-4 flex flex-wrap gap-2">
        {actions.map(({ key, label, variant = "outline" }) => (
          <button
            key={key}
            onClick={() => onReview(client, key)}
            className={`btn btn-${variant} btn-sm`}
          >
            {label}
          </button>
        ))}
        {onSkip && (
          <button
            onClick={() => onSkip(client)}
            className="btn btn-secondary btn-sm ml-auto"
          >
            Skip
          </button>
        )}
        {deleteScheduledClient && (
          <button
            onClick={() => deleteScheduledClient(client)}
            className="btn btn-danger btn-sm"
          >
            Delete
          </button>
        )}
      </div>

      {/* Enrichment trigger */}
      {enrichedClient === null && (
        <div className="mt-3">
          <button className="btn btn-outline btn-sm" onClick={handleEnrich}>
            Show Details
          </button>
        </div>
      )}

      {/* Enriched View */}
      {enrichedClient && client.caseNumber === enrichedClient.caseNumber && (
        <div className="mt-4 border-t pt-4">
          <div className="flex justify-between items-center mb-2">
            <h6 className="font-semibold">📊 Enriched Data</h6>
            <button
              onClick={handleClearEnrich}
              className="btn btn-sm btn-outline"
            >
              Hide
            </button>
          </div>

          {/* Billing Summary */}
          {enrichedClient.billingSummary && (
            <div className="mb-3">
              <h6>💳 Billing Summary</h6>
              <ul className="list-disc list-inside text-sm">
                <li>Total Fees: ${enrichedClient.billingSummary.TotalFees}</li>
                <li>
                  Paid Amount: ${enrichedClient.billingSummary.PaidAmount}
                </li>
                <li>Balance: ${enrichedClient.billingSummary.Balance}</li>
                <li>Past Due: ${enrichedClient.billingSummary.PastDue}</li>
              </ul>
            </div>
          )}

          {/* Invoices */}
          {Array.isArray(enrichedClient.invoices) &&
            enrichedClient.invoices.length > 0 && (
              <div className="mb-3">
                <h6>📑 Invoices</h6>
                <ul className="list-disc list-inside text-sm">
                  {enrichedClient.invoices.map((inv, idx) => (
                    <li key={idx}>
                      <strong>
                        {new Date(
                          inv.Date || inv.CreatedDate
                        ).toLocaleDateString()}
                      </strong>{" "}
                      — ${inv.UnitPrice ?? inv.Amount} —{" "}
                      {inv.Description || inv.Subject}
                    </li>
                  ))}
                </ul>
              </div>
            )}

          {/* Activities */}
          {Array.isArray(enrichedClient.filteredActivities) &&
            enrichedClient.filteredActivities.length > 0 && (
              <div className="mb-3">
                <h6>📋 Activities</h6>
                {enrichedClient.filteredActivities.map((act, idx) => (
                  <CollapsibleNote
                    key={act.CreatedDate + act.Subject}
                    act={act}
                  />
                ))}
              </div>
            )}

          {/* Tasks */}
          {Array.isArray(enrichedClient.tasks) &&
            enrichedClient.tasks.filter((t) => !t.Deleted).length > 0 && (
              <div className="mb-3">
                <h6>🗒️ Tasks</h6>
                <ul className="list-disc list-inside text-sm">
                  {enrichedClient.tasks
                    .filter((t) => !t.Deleted)
                    .map((t, idx) => (
                      <li key={idx}>
                        <strong>
                          Created by {t.CreatedByName} on{" "}
                          {new Date(
                            t.CreateDate || t.DueDate
                          ).toLocaleDateString()}
                        </strong>{" "}
                        — {t.Subject} (Due:{" "}
                        {new Date(t.DueDate).toLocaleDateString()}, Last
                        Reminder:{" "}
                        {new Date(t.LastReminded).toLocaleDateString()})
                      </li>
                    ))}
                </ul>
              </div>
            )}

          {/* Zero Invoice Action */}
          {onZeroInvoice && (
            <div className="mt-2">
              <button
                className="btn btn-outline btn-sm"
                onClick={() => onZeroInvoice(caseNumber)}
              >
                Zero Invoice
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

ClientAnalysisCard.propTypes = {
  client: PropTypes.shape({
    name: PropTypes.string,
    caseNumber: PropTypes.string.isRequired,
    email: PropTypes.string,
    cell: PropTypes.string,
    domain: PropTypes.string,
    reviewMessages: PropTypes.arrayOf(PropTypes.string),
  }).isRequired,
  actions: PropTypes.arrayOf(
    PropTypes.shape({
      key: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
      variant: PropTypes.oneOf(["primary", "secondary", "outline"]),
    })
  ).isRequired,
  onReview: PropTypes.func.isRequired,
  onSkip: PropTypes.func,
  onZeroInvoice: PropTypes.func,
};
