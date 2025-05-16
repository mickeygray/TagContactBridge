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
    autoPoa: false,
  });

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    let fieldValue;
    if (type === "checkbox") {
      fieldValue = checked;
    } else if (name === "autoPoa") {
      fieldValue = value === "true";
    } else {
      fieldValue = value;
    }
    setFormData((prev) => ({
      ...prev,
      [name]: fieldValue,
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
      autoPOA: false,
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
      autoPOA: false,
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
    <form className="client-form" onSubmit={handleSubmit}>
      <h3 className="client-form__title">➕ New Client Creation</h3>

      <div className="form-grid">
        <label className="form-field">
          Full Name
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
            className="form-input"
          />
        </label>

        <label className="form-field">
          Email Address
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            required
            className="form-input"
          />
        </label>

        <label className="form-field">
          Cell Number
          <input
            type="text"
            name="cell"
            value={formData.cell}
            onChange={handleChange}
            required
            className="form-input"
          />
        </label>

        <label className="form-field">
          Case Number
          <input
            type="text"
            name="caseNumber"
            value={formData.caseNumber}
            onChange={handleChange}
            required
            className="form-input"
          />
        </label>

        <label className="form-field">
          Initial Payment
          <input
            type="number"
            name="initialPayment"
            value={formData.initialPayment}
            onChange={handleChange}
            className="form-input"
          />
        </label>

        <label className="form-field">
          Second Payment Date
          <input
            type={inputFocused ? "date" : "text"}
            name="secondPaymentDate"
            value={formData.secondPaymentDate}
            onFocus={() => setInputFocused(true)}
            onChange={handleChange}
            className="form-input"
          />
        </label>

        <label className="form-field">
          Client Tier
          <select
            name="autoPOA"
            value={formData.autoPOA}
            onChange={handleChange}
            className="form-input"
          >
            <option value="false">Active Client</option>
            <option value="true">Tier 1</option>
          </select>
        </label>

        <label className="form-field">
          Domain
          <select
            name="domain"
            value={formData.domain}
            onChange={handleChange}
            className="form-input"
          >
            <option value="TAG">Tax Advocate Group</option>
            <option value="WYNN">Wynn Tax Solutions</option>
          </select>
        </label>
      </div>

      <button type="submit" className="form-submit">
        📤 Submit & Trigger Email
      </button>

      {newClient && newClient.status !== "inReview" && (
        <div className="notification-card notification-card--success">
          <h4 className="notification-card__title">
            ✅ Client added and Practitioner Email sent!
          </h4>
          <button
            type="button"
            className="action-button action-button--secondary"
            onClick={resetForm}
          >
            Add another client
          </button>
        </div>
      )}

      {newClient && newClient.status === "inReview" && (
        <div className="notification-card notification-card--warning">
          <h4 className="notification-card__title">
            🚨 Client flagged for review
          </h4>
          {newClient.reviewMessages?.map((m, i) => (
            <p key={i}>
              <strong>Reason {i + 1}:</strong> {m}
            </p>
          ))}
          <div className="notification-card__actions">
            <button
              type="button"
              className="action-button action-button--primary"
              onClick={() => handleReviewedAction("prac")}
            >
              Re‑send Prac Email
            </button>
            <button
              type="button"
              className="action-button action-button--primary"
              onClick={() => handleReviewedAction("433a")}
            >
              Send 433(a) Email
            </button>
            <button
              type="button"
              className="action-button action-button--warning"
              onClick={() => handleReviewedAction("delay")}
            >
              Delay 60 days
            </button>
            <button
              type="button"
              className="action-button action-button--info"
              onClick={() => handleReviewedAction("partial")}
            >
              Mark Partial
            </button>
            <button
              type="button"
              className="action-button action-button--danger"
              onClick={() => handleReviewedAction("inactive")}
            >
              Mark Inactive
            </button>
          </div>
        </div>
      )}
    </form>
  );
};

export default NewClientCreationForm;
