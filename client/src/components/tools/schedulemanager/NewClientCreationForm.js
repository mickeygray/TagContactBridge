import React, { useState, useContext } from "react";
import ClientContext from "../../../context/client/clientContext";
import NewSaleClientAnalysisCard from "../cards/NewSaleClientAnalysisCard";

const NewClientCreationForm = () => {
  const { addScheduledClient, newClient, clearNewClient } =
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
    <div className="new-client-form card p-6 mb-6 rounded-lg shadow-md bg-white">
      <h3 className="text-2xl font-bold mb-4">➕ Add New Client</h3>

      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-1 md:grid-cols-2 gap-6"
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
          <label key={fld.name} className="form-field flex flex-col">
            <span className="mb-1 font-medium">{label}</span>
            <input
              {...fld}
              value={formData[fld.name]}
              onChange={handleChange}
              className="input border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </label>
        ))}

        <label className="form-field flex flex-col">
          <span className="mb-1 font-medium">Client Tier</span>
          <select
            name="autoPOA"
            value={formData.autoPOA}
            onChange={handleChange}
            className="input border border-gray-300 rounded px-3 py-2"
          >
            <option value="false">Active Client</option>
            <option value="true">Tier 1</option>
          </select>
        </label>

        <label className="form-field flex flex-col">
          <span className="mb-1 font-medium">Domain</span>
          <select
            name="domain"
            value={formData.domain}
            onChange={handleChange}
            className="input border border-gray-300 rounded px-3 py-2"
          >
            <option value="TAG">Tax Advocate Group</option>
            <option value="WYNN">Wynn Tax Solutions</option>
          </select>
        </label>

        <div className="col-span-full">
          <button
            type="submit"
            className="btn btn-primary w-full md:w-auto bg-blue-600 text-white px-5 py-2 rounded hover:bg-blue-700 transition"
          >
            📤 Submit & Trigger Email
          </button>
        </div>
      </form>

      {/* Success Confirmation */}
      {newClient && newClient.client?.status !== "inReview" && (
        <div className="card bg-green-100 p-4 mt-6 rounded">
          <p className="font-medium text-green-800">
            ✅ Client added and Email sent!
          </p>
          <button
            onClick={resetForm}
            className="btn btn-sm mt-2 bg-green-700 text-white px-3 py-1 rounded hover:bg-green-800"
          >
            ➕ Add another client
          </button>
        </div>
      )}

      {/* Review Card */}
      {newClient?.client?.status === "inReview" && (
        <div className="mt-6">
          <NewSaleClientAnalysisCard
            client={newClient.client}
            onHide={resetForm}
          />
        </div>
      )}
    </div>
  );
};

export default NewClientCreationForm;
