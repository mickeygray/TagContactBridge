const textReducer = (state, action) => {
  switch (action.type) {
    case "SET_TEXT_MESSAGE":
      return {
        ...state,
        textMessage: action.payload, // Updates the message content
      };

    case "SET_TEXT_MESSAGE_LIST":
      return {
        ...state,
        list: action.payload, // Updates the recipient list
      };

    case "SENDING_TEXT":
      return {
        ...state,
        sending: true,
        message: "", // Clears any previous messages
      };

    case "TEXT_SENT":
      return {
        ...state,
        sending: false,
        message: "✅ Texts sent successfully!",
        list: [], // Clears list after sending
      };

    case "TEXT_ERROR":
      return {
        ...state,
        sending: false,
        message: `❌ Error: ${action.payload}`, // Sets error message
      };

    default:
      return state;
  }
};

export default textReducer;
