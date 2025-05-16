const scheduleReducer = (state, action) => {
  switch (action.type) {
    case "SET_DAILY_REVIEW_LISTS":
      return {
        ...state,
        toReview: action.payload.toReview || [],
        emailQueue: action.payload.emailQueue || [],
        textQueue: action.payload.textQueue || [],
        pace: action.payload.pace || 15,
      };
    case "REFRESH_QUEUES":
      return {
        ...state,
        toReview: action.payload.toReview || [],
        emailQueue: action.payload.emailQueue || [],
        textQueue: action.payload.textQueue || [],
      };

    case "SET_LOADING":
      return {
        ...state,
        loading: true,
      };
    case "UPDATE_SETTINGS":
      return {
        ...state,
        ...action.payload,
      };

    case "SKIP CLIENT":
      return {
        ...state,
        toReview: state.toReview.filter((c) => c.caseNumber !== action.payload),
      };

    case "CLEAR_LOADING":
      return {
        ...state,
        loading: false,
      };

    default:
      return state;
  }
};

export default scheduleReducer;
