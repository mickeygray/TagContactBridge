import React, { useState, useContext, useEffect } from "react";
import ScheduleContext from "../context/schedule/scheduleContext";
import LeadDetail from "./LeadDetail";
import axios from "axios";

const LeadListOrganizer = () => {
  const { scheduledDrops, getScheduledDrops, removeLeadFromDrop } =
    useContext(ScheduleContext);
  const [selectedDrop, setSelectedDrop] = useState("");
  const [leads, setLeads] = useState([]);
  const [selectedLead, setSelectedLead] = useState(null);

  useEffect(() => {
    getScheduledDrops(); // Fetch all scheduled drops for the week
  }, []);

  useEffect(() => {
    if (selectedDrop) {
      fetchLeadsForDrop(selectedDrop);
    }
  }, [selectedDrop]);

  const fetchLeadsForDrop = async (dropName) => {
    try {
      const response = await axios.get(
        `/api/scheduledmessages?drop=${dropName}`
      );
      setLeads(response.data);
    } catch (error) {
      console.error("Error fetching leads for drop:", error);
    }
  };

  return (
    <div className="lead-list-container">
      {selectedLead ? (
        <LeadDetail lead={selectedLead} onClose={() => setSelectedLead(null)} />
      ) : (
        <div>
          <h3>📋 Lead Organizer</h3>

          {/* Select Drop for the Week */}
          <div className="form-group">
            <label>📅 Select Scheduled Drop:</label>
            <select
              onChange={(e) => setSelectedDrop(e.target.value)}
              className="input-field"
            >
              <option value="">Select a Drop</option>
              {scheduledDrops.map((drop) => (
                <option key={drop._id} value={drop.name}>
                  {drop.name} ({drop.scheduledDate})
                </option>
              ))}
            </select>
          </div>

          {/* Show Leads for Selected Drop */}
          {leads.length === 0 ? (
            <p>No leads scheduled for this drop.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>City</th>
                  <th>State</th>
                  <th>Drop Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {leads.length !== 0 &&
                  leads.map((lead) => (
                    <tr key={lead._id}>
                      <td>{lead.name}</td>
                      <td>{lead.email}</td>
                      <td>{lead.phoneNumber || "N/A"}</td>
                      <td>{lead.city}</td>
                      <td>{lead.state}</td>
                      <td>{lead.scheduledDate}</td>
                      <td>
                        <button
                          className="button"
                          onClick={() => setSelectedLead(lead)}
                        >
                          🔍 View
                        </button>
                        <button
                          className="button danger"
                          onClick={() =>
                            removeLeadFromDrop(lead._id, selectedDrop)
                          }
                        >
                          ❌ Remove from Drop
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};

export default LeadListOrganizer;
