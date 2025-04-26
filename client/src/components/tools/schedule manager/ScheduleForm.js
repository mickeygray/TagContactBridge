import React, { useState, useContext } from "react";
import ScheduleContext from "../../../context/schedule/scheduleContext";

const ScheduleForm = () => {
  const { addScheduledClient } = useContext(ScheduleContext);
  const [inputFocused, setInputFocused] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    cell: "",
    caseNumber: "",
    initialPayment: "",
    secondPaymentDate: "",
    domain: "TAG", // TAG or WYNN
    alertAdserv: false, // ✅ NEW field
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
      stage: "prac", // Starting stage
      status: "active",
    };

    addScheduledClient(newClient);

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

  return (
    <form className="card p-4 mb-4" onSubmit={handleSubmit}>
      <h3 className="text-xl font-semibold mb-2">
        📅 Add New Client to Schedule
      </h3>

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

      {/* ✅ Alert Adserv checkbox */}
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
        ➕ Add Client & Send Prac Email
      </button>
    </form>
  );
};

export default ScheduleForm;
