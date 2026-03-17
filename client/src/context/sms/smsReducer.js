const smsReducer = (state, action) => {
  switch (action.type) {
    case "SET_CONVERSATIONS":
      return {
        ...state,
        conversations: action.payload.conversations,
        totalConversations: action.payload.total,
        currentPage: action.payload.page,
        totalPages: action.payload.pages,
        loading: false,
      };

    case "SET_ACTIVE_CONVERSATION":
      return {
        ...state,
        activeConversation: action.payload,
        loading: false,
      };

    case "CLEAR_ACTIVE_CONVERSATION":
      return {
        ...state,
        activeConversation: null,
      };

    case "UPDATE_CONVERSATION": {
      const updated = action.payload;
      return {
        ...state,
        conversations: state.conversations.map((c) =>
          c._id === updated._id ? { ...c, ...updated } : c,
        ),
        activeConversation:
          state.activeConversation?._id === updated._id
            ? { ...state.activeConversation, ...updated }
            : state.activeConversation,
      };
    }

    case "REMOVE_PENDING": {
      return {
        ...state,
        conversations: state.conversations.map((c) =>
          c._id === action.payload
            ? { ...c, responseStatus: "cancelled", autoSendAt: null }
            : c,
        ),
      };
    }

    case "SET_STATS":
      return {
        ...state,
        stats: action.payload,
      };

    case "SET_SETTINGS":
      return {
        ...state,
        settings: action.payload,
      };

    case "SET_FILTER":
      return {
        ...state,
        filters: { ...state.filters, ...action.payload },
      };

    case "SET_LOADING":
      return {
        ...state,
        loading: action.payload,
      };

    case "SMS_ERROR":
      return {
        ...state,
        loading: false,
        error: action.payload,
      };

    case "CLEAR_ERROR":
      return {
        ...state,
        error: null,
      };

    default:
      return state;
  }
};

export default smsReducer;
