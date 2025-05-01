import React, { useReducer } from "react";
import MessageContext from "./messageContext";
import messageReducer from "./messageReducer";

const initialState = {
  loading: false,
  message: null,
  error: false,
};

export default function MessageState({ children }) {
  const [state, dispatch] = useReducer(messageReducer, initialState);

  // Actions
  const startLoading = () => dispatch({ type: "SET_LOADING" });
  const stopLoading = () => dispatch({ type: "CLEAR_LOADING" });
  const showMessage = (title, text) =>
    dispatch({ type: "SET_MESSAGE", payload: { title, text } });
  const showError = (route, text, status) => {
    let suggestion = "";
    if (status === 401) suggestion = " Please log in to continue.";
    else if (status === 403)
      suggestion = " Your session may have expired—please log in again.";
    else if (status >= 500)
      suggestion = " Server error—please try again later.";

    const title = `${status} Error in ${route}`;
    dispatch({
      type: "SET_ERROR",
      payload: {
        title,
        text: `${text}${suggestion}`,
      },
    });
  };
  const clearMessage = () => dispatch({ type: "CLEAR_MESSAGE" });

  return (
    <MessageContext.Provider
      value={{
        loading: state.loading,
        message: state.message,
        error: state.error,
        startLoading,
        stopLoading,
        showMessage,
        showError,
        clearMessage,
      }}
    >
      {children}
    </MessageContext.Provider>
  );
}
