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
    case "REFRESH_DAILY_QUEUES":
      return {
        ...state,
        emailQueue: action.payload.emailQueue,
        textQueue: action.payload.textQueue,
        toReview: action.payload.toReview,
        loading: false,
        error: null,
      };

    case "REMOVE_FROM_REVIEW":
      return {
        ...state,
        toReview: state.toReview.filter(
          (client) =>
            !(
              client.caseNumber === action.payload.caseNumber &&
              client.domain === action.payload.domain
            )
        ),
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

    case "SKIP_CLIENT": {
      const client = action.payload;
      return {
        ...state,
        toReview: state.toReview.filter(
          (item) =>
            !(
              item.caseNumber === client.caseNumber &&
              item.domain === client.domain
            )
        ),
        emailQueue: state.emailQueue.filter(
          (item) =>
            !(
              item.caseNumber === client.caseNumber &&
              item.domain === client.domain
            )
        ),
        textQueue: state.textQueue.filter(
          (item) =>
            !(
              item.caseNumber === client.caseNumber &&
              item.domain === client.domain
            )
        ),
      };
    }
    case "SKIP_DAILY_CLIENT":
      // Optimistically remove from current queues
      return {
        ...state,
        emailQueue: state.emailQueue.filter(
          (client) =>
            !(
              client.caseNumber === action.payload.caseNumber &&
              client.domain === action.payload.domain
            )
        ),
        textQueue: state.textQueue.filter(
          (client) =>
            !(
              client.caseNumber === action.payload.caseNumber &&
              client.domain === action.payload.domain
            )
        ),
        toReview: state.toReview.filter(
          (client) =>
            !(
              client.caseNumber === action.payload.caseNumber &&
              client.domain === action.payload.domain
            )
        ),
      };
    case "REMOVE_FROM_ALL_QUEUES":
      const { caseNumber, domain } = action.payload;
      return {
        ...state,
        emailQueue: state.emailQueue.filter(
          (client) =>
            !(client.caseNumber === caseNumber && client.domain === domain)
        ),
        textQueue: state.textQueue.filter(
          (client) =>
            !(client.caseNumber === caseNumber && client.domain === domain)
        ),
        toReview: state.toReview.filter(
          (client) =>
            !(client.caseNumber === caseNumber && client.domain === domain)
        ),
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
