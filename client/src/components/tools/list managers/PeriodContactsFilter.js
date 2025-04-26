import React, { useState, useContext } from "react";
import ListContext from "../../../context/list/listContext";

const PeriodContactsFilter = () => {
  const { buildPeriod, filteredClients } = useContext(ListContext);

  const [filters, setFilters] = useState({
    stage: "",
    status: [],
    domain: "",
    saleFrom: "",
    saleTo: "",
    invoiceMin: "",
    invoiceMax: "",
    contactedThisPeriod: false,
    contactFrom: "",
    contactTo: "",
    reviewFrom: "",
    reviewTo: "",
  });

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFilters((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleStatusChange = (e) => {
    const options = Array.from(e.target.selectedOptions, (o) => o.value);
    setFilters((prev) => ({ ...prev, status: options }));
  };

  const applyFilters = () => {
    const payload = {};
    if (filters.stage) payload.stage = filters.stage;
    if (filters.status.length) payload.status = filters.status;
    if (filters.domain) payload.domain = filters.domain;
    if (filters.saleFrom || filters.saleTo) {
      payload.saleDate = {};
      if (filters.saleFrom) payload.saleDate.from = filters.saleFrom;
      if (filters.saleTo) payload.saleDate.to = filters.saleTo;
    }
    if (filters.invoiceMin || filters.invoiceMax) {
      payload.invoiceCount = {};
      if (filters.invoiceMin)
        payload.invoiceCount.min = Number(filters.invoiceMin);
      if (filters.invoiceMax)
        payload.invoiceCount.max = Number(filters.invoiceMax);
    }
    payload.contactedThisPeriod = filters.contactedThisPeriod;
    if (filters.contactFrom || filters.contactTo) {
      payload.lastContactDate = {};
      if (filters.contactFrom)
        payload.lastContactDate.from = filters.contactFrom;
      if (filters.contactTo) payload.lastContactDate.to = filters.contactTo;
    }
    if (filters.reviewFrom || filters.reviewTo) {
      payload.reviewDate = {};
      if (filters.reviewFrom) payload.reviewDate.from = filters.reviewFrom;
      if (filters.reviewTo) payload.reviewDate.to = filters.reviewTo;
    }

    buildPeriod(payload);
  };

  return (
    <div className="card">
      <h4>🔎 Build Period Contact List</h4>
      <div className="grid-2">
        <label>
          Stage*:
          <select name="stage" value={filters.stage} onChange={handleChange}>
            <option value="">–Select–</option>
            <option value="prac">Prac</option>
            <option value="poa">POA</option>
            <option value="f433a">433a</option>
            <option value="update433a">433a Update</option>
            <option value="penaltyAbatement">Penalty Abatement</option>
            <option value="taxOrganizer">Tax Organizer</option>
            <option value="taxDeadline">Tax Deadline</option>
            <option value="yearReview">Yearly Review</option>
          </select>
        </label>
        <label>
          Status:
          <select
            name="status"
            multiple
            value={filters.status}
            onChange={handleStatusChange}
          >
            <option value="active">Active</option>
            <option value="partial">Partial</option>
            <option value="adserv">Adserv</option>
            <option value="inactive">Inactive</option>
            <option value="inReview">In Review</option>
            <option value="delinquent">Delinquent</option>
          </select>
        </label>
        <label>
          Domain:
          <select name="domain" value={filters.domain} onChange={handleChange}>
            <option value="">All</option>
            <option value="WYNN">Wynn</option>
            <option value="TAG">TAG</option>
            <option value="AMITY">Amity</option>
          </select>
        </label>
        <label>
          Sale Date From:
          <input
            type="date"
            name="saleFrom"
            value={filters.saleFrom}
            onChange={handleChange}
          />
        </label>
        <label>
          Sale Date To:
          <input
            type="date"
            name="saleTo"
            value={filters.saleTo}
            onChange={handleChange}
          />
        </label>
        <label>
          Invoice Count ≥
          <input
            type="number"
            name="invoiceMin"
            value={filters.invoiceMin}
            onChange={handleChange}
          />
        </label>
        <label>
          Invoice Count ≤
          <input
            type="number"
            name="invoiceMax"
            value={filters.invoiceMax}
            onChange={handleChange}
          />
        </label>
        <label>
          Not Contacted Yet:
          <input
            type="checkbox"
            name="contactedThisPeriod"
            checked={filters.contactedThisPeriod}
            onChange={handleChange}
          />
        </label>
        <label>
          Last Contact From:
          <input
            type="date"
            name="contactFrom"
            value={filters.contactFrom}
            onChange={handleChange}
          />
        </label>
        <label>
          Last Contact To:
          <input
            type="date"
            name="contactTo"
            value={filters.contactTo}
            onChange={handleChange}
          />
        </label>
        <label>
          Review Date From:
          <input
            type="date"
            name="reviewFrom"
            value={filters.reviewFrom}
            onChange={handleChange}
          />
        </label>
        <label>
          Review Date To:
          <input
            type="date"
            name="reviewTo"
            value={filters.reviewTo}
            onChange={handleChange}
          />
        </label>
      </div>

      <button className="btn btn-primary mt-2" onClick={applyFilters}>
        Fetch Period Contacts
      </button>

      {filteredClients.length > 0 && (
        <div className="mt-4">
          <h5>Results ({filteredClients.length})</h5>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Stage</th>
                <th>Last Contact Date</th>
                <th>Review Date</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.map((c) => (
                <tr key={c._id}>
                  <td>{c.name}</td>
                  <td>{c.stage}</td>
                  <td>
                    {c.lastContactDate
                      ? new Date(c.lastContactDate).toLocaleDateString()
                      : "N/A"}
                  </td>
                  <td>
                    {c.reviewDate
                      ? new Date(c.reviewDate).toLocaleDateString()
                      : "N/A"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default PeriodContactsFilter;
