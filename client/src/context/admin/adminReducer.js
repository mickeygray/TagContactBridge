const adminReducer = (state, action) => {
  switch (action.type) {
    case "SET_REQUESTS":
      return { ...state, requests: action.payload, loading: false };
    case "SET_USERS":
      return { ...state, users: action.payload, loading: false };
    case "ADMIN_LOADING":
      return { ...state, loading: true };
    case "CLEAR_ADMIN":
      return { requests: [], users: [], loading: false };
    default:
      return state;
  }
};

export default adminReducer;
