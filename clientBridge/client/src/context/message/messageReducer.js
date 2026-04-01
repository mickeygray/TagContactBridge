export default function messageReducer(state, action) {
  switch (action.type) {
    case "SET_LOADING":
      return { ...state, loading: true };
    case "CLEAR_LOADING":
      return { ...state, loading: false };
    case "SET_MESSAGE":
      return { ...state, message: action.payload, error: false };
    case "SET_ERROR":
      return { ...state, message: action.payload, error: true };
    case "CLEAR_MESSAGE":
      return { ...state, message: null, error: false };
    default:
      return state;
  }
}
