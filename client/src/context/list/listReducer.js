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
    case "CLEAR_FILTER_LIST":
      return {
        ...state,
        filteredClients: [],
      };
    case "SKIP_CLIENT":
      return {
        ...state,
        // remove any reviewClient whose caseNumber matches the payload
        reviewClients: state.reviewClients.filter(
          (c) => c.caseNumber !== action.payload
        ),
      };
    case "SET_RECORD_COUNT":
      return {
        ...state,
        recordCount: action.payload,
      };
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
    case "PREPARE_LIST":
      return {
        ...state,
        filteredClients: action.payload,
      };
    default:
      return state;
  }
};
