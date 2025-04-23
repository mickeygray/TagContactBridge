import React, { useState, useContext } from "react";

const LeadDetail = ({ lead, isProspect, onClose }) => {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [formData, setFormData] = useState({ ...lead });

  const handleDelete = () => {
    setShowDeleteModal(false);
    onClose();
  };

  const handleConvertToClient = () => {
    onClose();
  };

  const handleFreezeToggle = () => {
    setFormData((prevState) => ({
      ...prevState,
      isFrozen: !prevState.isFrozen,
    }));
  };

  return (
    <div className="lead-detail-container">
      <h3>{formData.name}'s Profile</h3>
      <div className="lead-form">
        <div className="grid-item">
          <label>Email:</label>
          <input type="text" value={formData.email} readOnly />
        </div>

        <div className="grid-item">
          <label>Phone:</label>
          <input
            type="text"
            value={formData.cell || formData.home || "N/A"}
            readOnly
          />
        </div>

        <div className="grid-item">
          <label>Address:</label>
          <input type="text" value={formData.address || "N/A"} readOnly />
        </div>

        <div className="grid-item">
          <label>City:</label>
          <input type="text" value={formData.city || "N/A"} readOnly />
        </div>

        <div className="grid-item">
          <label>State:</label>
          <input type="text" value={formData.state || "N/A"} readOnly />
        </div>

        <div className="grid-item">
          <label>Status:</label>
          <input
            type="text"
            value={isProspect ? "Prospect" : "Client"}
            readOnly
          />
        </div>

        {!isProspect && (
          <>
            <div className="grid-item">
              <label>Last Email Sent:</label>
              <input
                type="text"
                value={formData.lastEmailSent || "No Email Sent"}
                readOnly
              />
            </div>
            <div className="grid-item">
              <label>Last Contact Date:</label>
              <input
                type="text"
                value={
                  formData.lastContactDate
                    ? new Date(formData.lastContactDate).toLocaleDateString()
                    : "No Contact"
                }
                readOnly
              />
            </div>
            <div className="grid-item">
              <label>Frozen Status:</label>
              <input
                type="text"
                value={formData.isFrozen ? "Frozen" : "Not Frozen"}
                readOnly
              />
            </div>
          </>
        )}
      </div>

      {/* Action Buttons */}
      <div className="actions">
        <button className="button" onClick={onClose}>
          Close
        </button>

        {!isProspect ? (
          <button className="button warning" onClick={handleFreezeToggle}>
            {formData.isFrozen ? "Unfreeze Lead" : "Freeze Lead"}
          </button>
        ) : (
          <button className="button primary" onClick={handleConvertToClient}>
            Convert to Client
          </button>
        )}

        <button
          className="button danger"
          onClick={() => setShowDeleteModal(true)}
        >
          Delete {isProspect ? "Prospect" : "Lead"}
        </button>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="modal">
          <div className="modal-content">
            <h4>
              Are you sure you want to delete this{" "}
              {isProspect ? "prospect" : "lead"}?
            </h4>
            <div className="modal-actions">
              <button
                className="button"
                onClick={() => setShowDeleteModal(false)}
              >
                Cancel
              </button>
              <button className="button danger" onClick={handleDelete}>
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeadDetail;
