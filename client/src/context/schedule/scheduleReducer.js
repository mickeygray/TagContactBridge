const scheduleReducer = (state, action) => {
  switch (action.type) {
    case "SET_DAILY_REVIEW_LISTS":
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
