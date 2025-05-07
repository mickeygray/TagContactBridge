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
    case "SKIP_CLIENT": {
      const clientId = action.payload;
      return {
        ...state,
        toReview: state.toReview.filter((c) => c._id !== clientId),
        verified: state.verified.filter((c) => c._id !== clientId),
        partial: state.partial.filter((c) => c._id !== clientId),
        // if you have other lists (e.g. “hold”, “archived”), filter them here too
      };
    }
    case "PARSE_ZEROS":
      return {
        ...state,
        zeroInvoiceList: action.payload,
        loading: false,
        error: null,
      };
    case "LIST_ERROR":
      return {
        ...state,
        error: action.payload,
        loading: false,
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
    case "ADD_CLIENT_TO_PERIOD":
      return {
        ...state,
      };
    case "PROSPECT_DIALER":
      return {
        ...state,
        prospectDialerList: action.payload,
        loading: false,
        error: null,
      };
    default:
      return state;
  }
};
