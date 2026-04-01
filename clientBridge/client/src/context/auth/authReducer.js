const AuthReducer = (state, action) => {
  switch (action.type) {
    case "LOGIN_SUCCESS":
      return {
        ...state,
        user: action.payload,
        isAuthenticated: true,
        loading: false,
      };
    case "LOGOUT":
      return { ...state, user: null, isAuthenticated: false, loading: false };
    case "AUTH_LOADING":
      return { ...state, loading: true };
    default:
      return state;
  }
};

export default AuthReducer;
