import React, { useReducer } from "react";
import axios from "axios";
import AdminContext from "./adminContext";
import adminReducer from "./adminReducer";

const AdminState = ({ children }) => {
  const initialState = {
    requests: [],
    users: [],
    loading: false,
  };

  const [state, dispatch] = useReducer(adminReducer, initialState);

  const getRequests = async () => {
    dispatch({ type: "ADMIN_LOADING" });
    const res = await axios.get("/api/admin/requests", {
      withCredentials: true,
    });
    dispatch({ type: "SET_REQUESTS", payload: res.data });
  };

  const getUsers = async () => {
    dispatch({ type: "ADMIN_LOADING" });
    const res = await axios.get("/api/admin/users", { withCredentials: true });
    dispatch({ type: "SET_USERS", payload: res.data });
  };

  const inviteUser = async (inviteData) => {
    try {
      await axios.post("/api/invite", inviteData, { withCredentials: true });
      alert("✅ Invite sent successfully");
    } catch (err) {
      alert(
        "❌ Error sending invite: " +
          (err.response?.data?.message || err.message)
      );
    }
  };

  const deleteUser = async (id) => {
    await axios.delete(`/api/admin/user/${id}`, { withCredentials: true });
    getUsers();
  };

  const logoutUser = async (id) => {
    await axios.post(
      `/api/admin/logout-user/${id}`,
      {},
      { withCredentials: true }
    );
    getUsers();
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
