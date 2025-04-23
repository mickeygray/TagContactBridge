const prospectReducer = (state, action) => {
  switch (action.type) {
    case "GET_PROSPECTS":
      return {
        ...state,
        prospects: action.payload,
      };

    case "UPLOAD_PROSPECTS":
      return {
        ...state,
        prospects: [...state.prospects, ...action.payload],
      };

    case "UPDATE_PROSPECTS_FROM_CALLS":
      return {
        ...state,
        prospects: state.prospects.map(
          (prospect) =>
            action.payload.find(
              (updatedProspect) => updatedProspect._id === prospect._id
            ) || prospect
        ),
      };

    case "UPDATE_PROSPECTS_FROM_INVOICES":
      return {
        ...state,
        prospects: state.prospects.filter(
          (prospect) =>
            !action.payload.find(
              (deletedProspect) => deletedProspect._id === prospect._id
            )
        ),
      };
    case "DELETE_PROSPECT":
      return {
        ...state,
        prospects: state.prospects.filter(
          (prospect) => prospect._id !== action.payload
        ),
      };
    case "ADD_LEAD":
      return {
        ...state,
        leads: [...state.leads, action.payload], // Add the new lead
      };
    default:
      return state;
  }
};

export default prospectReducer;
