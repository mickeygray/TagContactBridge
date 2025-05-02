export default (state, action) => {
  switch (action.type) {
    case "POST_LEADS":
      return {
        ...state,
      };

    case "SAVE_CONTACT_LIST":
      return {
        ...state,
      };

    case "SET_PERIOD_RESULTS":
      return {
        ...state,
        verified: action.payload.verified,
        periodInfo: action.payload.periodInfo,
        toReview: action.payload.toReview,
        partial: action.payload.partial,
      };
    case "CLEAR_PERIOD":
      return {
        ...state,
        verified: [],
        periodInfo: null,
        toReview: [],
        partial: [],
      };
    case "CLEAR_REVIEW_CLIENTS":
      return { ...state, reviewClients: [] };
    case "SET_REVIEW_CLIENTS":
      return {
        ...state,
        reviewClients: action.payload,
      };
    case "SAVE_REVIEW_CLIENT":
      return {
        ...state,
        newClients: action.payload,
      };
    case "REMOVE_REVIEW_CLIENT":
      return {
        ...state,
        reviewClients: state.reviewClients.filter(
          (c) => c.caseNumber !== action.payload
        ),
      };
    default:
      return state;
  }
};
