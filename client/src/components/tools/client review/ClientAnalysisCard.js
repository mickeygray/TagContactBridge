import React, { useContext } from "react";
import CollapsibleNote from "../../layout/CollapsibleNote";
import ClientContext from "../../../context/client/clientContext";
const ClientAnalysisCard = ({ client, setExpandedIndex }) => {
  const { activities, invoices, payments } = client;
  console.log(client);
  const { postZeroInvoice } = useContext(ClientContext);
  const filteredActivities = activities.filter((a) => {
    const subject = a.Subject?.toLowerCase() || "";
    const comment = a.Comment?.toLowerCase() || "";

    const keywords = [
      "swc",
      "note",
      "invoice",
      "message",
      "cci",
      "a/s",
      "adserv",
      "additional",
      "fed",
      "complain",
    ];

    const lastNames = [
      "anderson",
      "cazares",
      "wallace",
      "wells",
      "haro",
      "hayes",
      "pearson",
      "burton",
      "pineda",
      "collins",
    ];

    const subjectMatch = keywords.some((kw) => subject.includes(kw));
    const commentMatch = lastNames.some((name) => comment.includes(name));

    return subjectMatch || commentMatch;
  });
  const caseID = client["Case #"];
  const handleZeroInvoice = async () => {
    await postZeroInvoice(caseID);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
        <span
          className="action-button"
          onClick={() => setExpandedIndex(null)}
          title="Return to List"
        >
          ⬅
        </span>
        <span className="action-button danger" title="Remove from List">
          ✖
        </span>
      </div>
      <div className="client-card">
        <h3 className="client-title">{client.Name || "Unnamed Client"}</h3>
        <p>
          <strong>Case ID:</strong> {client["Case #"] || "N/A"}
        </p>
        <p>
          <strong>Status:</strong> {client.Status}
        </p>
        <div className="mt-2">
          <h5>📌 Notes from Activities</h5>
          {filteredActivities.length > 0 ? (
            filteredActivities.map((act, idx) => (
              <CollapsibleNote key={idx} act={act} />
            ))
          ) : (
            <p>No relevant notes found.</p>
          )}

          <div className="invoice-section">
            <h4>📑 Invoices</h4>
            <ul>
              {invoices.map((inv, i) => (
                <li key={i}>
                  <strong>{new Date(inv.Date).toLocaleDateString()}</strong> — $
                  {inv.UnitPrice} — {inv.Description}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="payment-section">
          <h4>💰 Payments</h4>
          <ul>
            {payments.map((p, i) => (
              <li key={i}>
                <strong>{new Date(p.PaidDate).toLocaleDateString()}</strong> — $
                {p.Amount} — {p.PaymentTypeName} — Balance: ${p.Balance}
              </li>
            ))}
          </ul>
        </div>{" "}
        <div className="card-actions">
          <button
            className="btn btn-sm btn-outline"
            onClick={handleZeroInvoice}
          >
            Zero Invoice
          </button>
        </div>
      </div>
    </div>
  );
};

export default ClientAnalysisCard;
