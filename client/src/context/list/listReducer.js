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

    case "ADD_TO_LEXARRAY":
      return {
        ...state,
        lexDataArray: [...state.lexDataArray, action.payload],
      };

    case "CLEAR_LEXARRAY":
      return {
        ...state,
        lexDataArray: [],
      };
    case "CLEAR_FILTER_LIST":
      return {
        ...state,
        filteredClients: [],
      };
    case "SKIP_CLIENT":
      return {
        ...state,
        toReview: state.toReview.filter(
          (c) =>
            !(
              c.caseNumber === action.payload.caseNumber &&
              c.domain === action.payload.domain
            )
        ),
        partial: state.partial.filter(
          (c) =>
            !(
              c.caseNumber === action.payload.caseNumber &&
              c.domain === action.payload.domain
            )
        ),
        verified: state.verified.filter(
          (c) =>
            !(
              c.caseNumber === action.payload.caseNumber &&
              c.domain === action.payload.domain
            )
        ),
      };
    case "SET_SEARCHED_CLIENTS":
      return {
        ...state,
        searchedClients: action.payload || [],
      };
    case "SET_VALIDATED_LIEN_LIST": {
      const combined = [...state.validatedLienList, ...action.payload];

      console.log(combined);
      // Deduplicate by caseNumber
      const deduped = Object.values(
        combined.reduce((acc, item) => {
          acc[item.caseNumber] = item;
          return acc;
        }, {})
      );

      return {
        ...state,
        validatedLienList: deduped,
        loading: false,
      };
    }
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
        toReview: action.payload,
      };
    case "SAVE_REVIEW_CLIENT":
      return {
        ...state,
        newClients: action.payload,
      };
    case "REMOVE_REVIEW_CLIENT":
      return {
        ...state,
        toReview: state.toReview.filter((c) => c.caseNumber !== action.payload),
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
