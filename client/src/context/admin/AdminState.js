import React, { useReducer } from "react";
import AdminContext from "./adminContext";
import adminReducer from "./adminReducer";
import { useApi } from "../../utils/api";

const AdminState = ({ children }) => {
  const initialState = {
    requests: [],
    users: [],
    loading: false,
  };

  const [state, dispatch] = useReducer(adminReducer, initialState);
  const api = useApi();
  api.defaults.withCredentials = true;

  const getRequests = async () => {
    dispatch({ type: "ADMIN_LOADING" });
    try {
      const res = await api.get("/api/admin/requests");
      dispatch({ type: "SET_REQUESTS", payload: res.data });
    } catch (err) {
      dispatch({ type: "ADMIN_ERROR" });
    }
  };

  const getUsers = async () => {
    dispatch({ type: "ADMIN_LOADING" });
    try {
      const res = await api.get("/api/admin/users");
      dispatch({ type: "SET_USERS", payload: res.data });
    } catch (err) {
      dispatch({ type: "ADMIN_ERROR" });
    }
  };

  const inviteUser = async (inviteData) => {
    dispatch({ type: "ADMIN_LOADING" });
    try {
      await api.post("/api/invite", inviteData);
      // optional: dispatch success message
    } catch (err) {
      // optional: dispatch error message
    } finally {
      dispatch({ type: "ADMIN_DONE" });
    }
  };

  const deleteUser = async (id) => {
    dispatch({ type: "ADMIN_LOADING" });
    try {
      await api.delete(`/api/admin/user/${id}`);
      getUsers();
    } catch (err) {
      // handle error
    }
  };

  const logoutUser = async (id) => {
    dispatch({ type: "ADMIN_LOADING" });
    try {
      await api.post(`/api/admin/logout-user/${id}`);
      getUsers();
    } catch (err) {
      // handle error
    }
  };

  return (
    <AdminContext.Provider
      value={{
        requests: state.requests,
        users: state.users,
        loading: state.loading,
        getRequests,
        getUsers,
        inviteUser,
        deleteUser,
        logoutUser,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
};

export default AdminState;
