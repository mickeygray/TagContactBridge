// client/src/context/admin/adminReducer.js
const adminReducer = (state, action) => {
  switch (action.type) {
    case "SET_LOADING":
      return { ...state, loading: action.payload };
    case "SET_ERROR":
      return { ...state, error: action.payload, loading: false };
    case "SET_CONSENT_RECORDS":
      return { ...state, consentRecords: action.payload, error: null };
    case "SET_CONSENT_RECORD":
      return { ...state, consentRecord: action.payload, error: null };
    case "SET_CONSENT_STATS":
      return { ...state, consentStats: action.payload };
    default:
      return state;
  }
};

export default adminReducer;
