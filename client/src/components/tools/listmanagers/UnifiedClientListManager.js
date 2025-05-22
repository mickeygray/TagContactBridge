import React, { useContext, useState } from "react";
import ListContext from "../../../context/list/listContext";
import MessageContext from "../../../context/message/messageContext";
import UnifiedClientAnalysisList from "../lists/UnifiedClientAnalysisList";

export default function UnifiedClientListManager() {
  const { searchedClients, searchUnifiedClients } = useContext(ListContext);
  const { showError } = useContext(MessageContext);

  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState({
    dateType: "createDate",
    startDate: "",
    endDate: "",
    stagePiece: "",
    status: "",
    invoiceCount: "",
    lastInvoiceAmount: "",
    totalPayment: "",
    domain: "TAG",
  });

  const handleSearch = async (e) => {
    e.preventDefault();
    try {
      await searchUnifiedClients({ query, ...filters });
    } catch (err) {
      showError("Search", err.message);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <div className="unified-manager">
      <form onSubmit={handleSearch} className="unified-form">
        <input
          type="text"
          placeholder="Search by name, case number, cell, or email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="unified-input full"
        />

        <div className="unified-grid">
          <select
            name="dateType"
            value={filters.dateType}
            onChange={handleChange}
            className="unified-select full"
          >
            <option>Select Date Filter</option>
            <option value="createDate">Create Date</option>
            <option value="saleDate">Sale Date</option>
          </select>

          <select
            name="domain"
            value={filters.domain}
            onChange={handleChange}
            className="unified-select full"
          >
            <option>Select Domain</option>
            <option value="WYNN">Wynn</option>
            <option value="TAG">Tag</option>
            <option value="AMITY">Amity</option>
          </select>
          <select
            name="status"
            value={filters.status}
            onChange={handleChange}
            className="unified-select full"
          >
            <option>Select Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="partial">Partial</option>
          </select>

          <input
            type="date"
            name="startDate"
            value={filters.startDate}
            onChange={handleChange}
            className="unified-input"
          />

          <input
            type="date"
            name="endDate"
            value={filters.endDate}
            onChange={handleChange}
            className="unified-input"
          />

          <input
            type="text"
            name="stagePiece"
            value={filters.stagePiece}
            onChange={handleChange}
            placeholder="Stage Piece (e.g., f433a Text 1)"
            className="unified-input full"
          />

          <input
            type="number"
            name="invoiceCount"
            value={filters.invoiceCount}
            onChange={handleChange}
            placeholder="Invoice Count ≥"
            className="unified-input"
          />

          <input
            type="number"
            name="lastInvoiceAmount"
            value={filters.lastInvoiceAmount}
            onChange={handleChange}
            placeholder="Last Invoice Amount ≥"
            className="unified-input"
          />

          <input
            type="number"
            name="totalPayment"
            value={filters.totalPayment}
            onChange={handleChange}
            placeholder="Total Payment ≥"
            className="unified-input full"
          />
        </div>

        <button type="submit" className="unified-btn">
          Search Clients
        </button>
      </form>

      {searchedClients.length > 0 && (
        <UnifiedClientAnalysisList
          clients={searchedClients}
          title={`🔍 ${searchedClients.length} Client(s) Found`}
        />
      )}
    </div>
  );
}
