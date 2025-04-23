export default (state, action) => {
  switch (action.type) {
    case "UPLOAD_LEADS":
      return { ...state };

    case "GET_LEADS":
      return {
        ...state,
        activeLeads: action.payload.filter(
          (lead) => !lead.isFrozen && !lead.isUnfrozen
        ),
        frozenLeads: action.payload.filter((lead) => lead.isFrozen),
        unfrozenLeads: action.payload.filter((lead) => lead.isUnfrozen),
      };

    case "UPDATE_LEADS_FROM_CALLS":
      return { ...state, activeLeads: action.payload };

    case "UPDATE_LEADS_FROM_INVOICES":
      return {
        ...state,
        activeLeads: state.activeLeads.map(
          (lead) =>
            action.payload.find(
              (updatedLead) => updatedLead._id === lead._id
            ) || lead
        ),
      };

    case "TOGGLE_FREEZE":
      return {
        ...state,
        activeLeads: state.activeLeads.filter(
          (lead) => lead._id !== action.payload.leadId
        ),
        frozenLeads: [
          ...state.frozenLeads,
          {
            ...state.activeLeads.find(
              (lead) => lead._id === action.payload.leadId
            ),
            isFrozen: true,
          },
        ],
      };

    case "TOGGLE_UNFREEZE":
      return {
        ...state,
        frozenLeads: state.frozenLeads.filter(
          (lead) => lead._id !== action.payload
        ),
        unfrozenLeads: [
          ...state.unfrozenLeads,
          {
            ...state.frozenLeads.find((lead) => lead._id === action.payload),
            isFrozen: false,
            isUnfrozen: true,
          },
        ],
      };

    case "DELETE_LEAD":
      return {
        ...state,
        activeLeads: state.activeLeads.filter(
          (lead) => lead._id !== action.payload
        ),
        frozenLeads: state.frozenLeads.filter(
          (lead) => lead._id !== action.payload
        ),
        unfrozenLeads: state.unfrozenLeads.filter(
          (lead) => lead._id !== action.payload
        ),
      };

    default:
      return state;
  }
};
