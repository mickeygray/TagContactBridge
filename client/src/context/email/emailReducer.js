const emailReducer = (state, action) => {
  switch (action.type) {
    case "SENDING_EMAILS":
      return {
        ...state,
        sending: true,
        successMessage: null,
        errorMessage: null,
      };
    case "EMAILS_SENT":
      return { ...state, sending: false, successMessage: action.payload };
    case "EMAILS_ERROR":
      return { ...state, sending: false, errorMessage: action.payload };
    default:
      return state;
  }
};

export default emailReducer;
