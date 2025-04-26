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

    case "SET_FILTERED_CLIENTS":
      return {
        ...state,
        filteredClients: action.payload,
      };

    case "SET_REVIEW_CLIENTS":
      return {
        ...state,
        reviewClients: action.payload,
      };
    default:
      return state;
  }
};
