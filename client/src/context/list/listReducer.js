export default (state, action) => {
  switch (action.type) {
    case "POST_LEADS":
      return {
        ...state,
      };
    case "SET_PROSPECT_LIST":
      return {
        ...state,
        finalProspectList: action.payload,
      };
    case "SET_CLIENT_LIST":
      return {
        ...state,
        finalClientList: action.payload,
      };
    case "ADD_CONTACT_CLIENT":
      return {
        ...state,
        contactList: [...state.contactList, action.payload],
      };

    case "SAVE_CONTACT_LIST":
      return {
        ...state,
      };

    case "GET_CLIENT_LIST":
      return {
        ...state,
        clients: action.payload,
      };

    case "REMOVE_FROM_FINAL_CLIENT_LIST":
      return {
        ...state,
        finalClientList: state.finalClientList.filter(
          (c) => c["Case #"] !== action.payload["Case #"]
        ),
      };
  }
};
