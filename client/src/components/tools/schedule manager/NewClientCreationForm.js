import React, { useState, useContext } from "react";
import ClientContext from "../../../context/client/clientContext";

const NewClientCreationForm = () => {
  const { addScheduledClient, processReviewedClient, newClient } =
    useContext(ClientContext);
  const [inputFocused, setInputFocused] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    cell: "",
    caseNumber: "",
    initialPayment: "",
    secondPaymentDate: "",
    domain: "TAG",
    alertAdserv: false,
  });

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    const today = new Date().toISOString().split("T")[0];

    const newClient = {
      ...formData,
      saleDate: today,
      stage: "prac",
      status: "active",
    };

    addScheduledClient(newClient); // now posts to /api/clients

    // Reset form
    setFormData({
      name: "",
      email: "",
      cell: "",
      caseNumber: "",
      initialPayment: "",
      secondPaymentDate: "",
      domain: "TAG",
      alertAdserv: false,
    });
  };

  const resetForm = () => {
    setFormData({
      name: "",
      email: "",
      cell: "",
      caseNumber: "",
      initialPayment: "",
      secondPaymentDate: "",
      domain: "TAG",
      alertAdserv: false,
    });
  };
  const handleReviewedAction = async (client, action) => {
    try {
      processReviewedClient(client, action);
      // you might dispatch or re-fetch your list here…
      alert(`Action "${action}" applied.`);
    } catch (err) {
      console.error(err);
      alert(`Failed to apply "${action}".`);
    }
  };

  return (
    <form className="card p-4 mb-4" onSubmit={handleSubmit}>
      <h3 className="text-xl font-semibold mb-2">➕ New Client Creation</h3>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <input
          type="text"
          name="name"
          placeholder="Full Name"
          value={formData.name}
          onChange={handleChange}
          required
          className="input"
        />
        <input
          type="email"
          name="email"
          placeholder="Email Address"
          value={formData.email}
          onChange={handleChange}
          required
          className="input"
        />
        <input
          type="text"
          name="cell"
          placeholder="Cell Number"
          value={formData.cell}
          onChange={handleChange}
          required
          className="input"
        />
        <input
          type="text"
          name="caseNumber"
          placeholder="Case Number"
          value={formData.caseNumber}
          onChange={handleChange}
          required
          className="input"
        />
        <input
          type="number"
          name="initialPayment"
          placeholder="Initial Payment"
          value={formData.initialPayment}
          onChange={handleChange}
          className="input"
        />
        <input
          type={inputFocused ? "date" : "text"}
          name="secondPaymentDate"
          value={formData.secondPaymentDate}
          onFocus={() => setInputFocused(true)}
          onChange={handleChange}
          placeholder="Second Payment Date"
          className="input"
        />
        <select
          name="domain"
          value={formData.domain}
          onChange={handleChange}
          className="input"
        >
          <option value="TAG">Tax Advocate Group</option>
          <option value="WYNN">Wynn Tax Solutions</option>
        </select>
      </div>

      <div className="mt-4">
        <label className="inline-flex items-center">
          <input
            type="checkbox"
            name="alertAdserv"
            checked={formData.alertAdserv}
            onChange={handleChange}
            className="mr-2"
          />
          🚨 Alert Adserv
        </label>
      </div>

      <button type="submit" className="button primary mt-4">
        📤 Submit & Trigger Email
      </button>
      {newClient && (
        <div className="card p-4 mb-4 border-yellow-400 bg-yellow-50">
          {newClient.status !== "inReview" ? (
            <>
              <h4 className="font-bold text-green-800">
                ✅ Client added and Practitioner Email sent!
              </h4>
              <button className="button secondary mt-2" onClick={resetForm}>
                Add another client
              </button>
            </>
          ) : (
            <>
              <h4 className="font-bold text-red-700 mb-2">
                🚨 Client flagged for review
              </h4>
              {newClient.reviewMessages &&
                newClient.reviewMessages.map((m, i) => (
                  <p>
                    <strong>Reason {i + 1}:</strong> {m}
                  </p>
                ))}
              <div className="flex flex-wrap gap-2">
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => handleReviewedAction("prac")}
                >
                  Re‑send Prac Email
                </button>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => handleReviewedAction("433a")}
                >
                  Send 433(a) Email
                </button>
                <button
                  className="btn btn-sm btn-warning"
                  onClick={() => handleReviewedAction("delay")}
                >
                  Delay 60 days
                </button>
                <button
                  className="btn btn-sm btn-info"
                  onClick={() => handleReviewedAction("partial")}
                >
                  Mark Partial
                </button>
                <button
                  className="btn btn-sm btn-danger"
                  onClick={() => handleReviewedAction("inactive")}
                >
                  Mark Inactive
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </form>
  );
};

export default NewClientCreationForm;
