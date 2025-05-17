// src/components/tools/listManagers/NewClientCreationForm.jsx
import React, { useState, useContext } from "react";
import ClientContext from "../../../context/client/clientContext";
import NewSaleClientAnalysisCard from "../cards/NewSaleClientAnalysisCard";

const NewClientCreationForm = () => {
  const {
    addScheduledClient,
    newClient,
    // we'll need to clear it once hidden
    clearNewClient,
  } = useContext(ClientContext);

  const [inputFocused, setInputFocused] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    cell: "",
    caseNumber: "",
    initialPayment: "",
    secondPaymentDate: "",
    domain: "TAG",
    autoPOA: false,
  });

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]:
        type === "checkbox"
          ? checked
          : name === "autoPOA"
          ? value === "true"
          : value,
    }));
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
    clearNewClient();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const today = new Date().toISOString().split("T")[0];
    addScheduledClient({
      ...formData,
      saleDate: today,
      stage: "prac",
      status: "active",
    });
  };

  return (
    <div className="card p-4 mb-6">
      <h3 className="text-xl font-semibold mb-4">➕ New Client Creation</h3>

      {/* form */}
      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
      >
        {[
          { label: "Full Name", name: "name", type: "text", required: true },
          { label: "Email", name: "email", type: "email", required: true },
          { label: "Cell", name: "cell", type: "text", required: true },
          { label: "Case #", name: "caseNumber", type: "text", required: true },
          { label: "Initial Payment", name: "initialPayment", type: "number" },
          {
            label: "Second Payment Date",
            name: "secondPaymentDate",
            type: inputFocused ? "date" : "text",
            onFocus: () => setInputFocused(true),
          },
        ].map(({ label, ...fld }) => (
          <label key={fld.name} className="flex flex-col">
            {label}
            <input
              {...fld}
              value={formData[fld.name]}
              onChange={handleChange}
              className="input"
            />
          </label>
        ))}

        <label className="flex flex-col">
          Client Tier
          <select
            name="autoPOA"
            value={formData.autoPOA}
            onChange={handleChange}
            className="input"
          >
            <option value="false">Active Client</option>
            <option value="true">Tier 1</option>
          </select>
        </label>

        <label className="flex flex-col">
          Domain
          <select
            name="domain"
            value={formData.domain}
            onChange={handleChange}
            className="input"
          >
            <option value="TAG">Tax Advocate Group</option>
            <option value="WYNN">Wynn Tax Solutions</option>
          </select>
        </label>

        <div className="col-span-full">
          <button type="submit" className="btn btn-primary">
            📤 Submit & Trigger Email
          </button>
        </div>
      </form>

      {/* result */}
      {newClient && newClient.status !== "inReview" && (
        <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded">
          <p className="font-medium">
            ✅ Client added and Practitioner Email sent!
          </p>
          <button onClick={resetForm} className="mt-2 btn btn-sm">
            Add another client
          </button>
        </div>
      )}

      {newClient && newClient.status === "inReview" && (
        <div className="mt-6">
          <NewSaleClientAnalysisCard client={newClient} onHide={resetForm} />
        </div>
      )}
    </div>
  );
};

export default NewClientCreationForm;
