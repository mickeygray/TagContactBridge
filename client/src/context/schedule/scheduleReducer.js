const scheduleReducer = (state, action) => {
  switch (action.type) {
    case "ADD_SCHEDULED_CLIENT":
      return {
        ...state,
        scheduledClients: [...state.scheduledClients, action.payload],
      };

    case "UPDATE_SCHEDULED_CLIENT":
      return {
        ...state,
        scheduledClients: state.scheduledClients.map((client) =>
          client._id === action.payload._id ? action.payload : client
        ),
      };

    case "DELETE_SCHEDULED_CLIENT":
      return {
        ...state,
        scheduledClients: state.scheduledClients.filter(
          (client) => client._id !== action.payload
        ),
      };

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
