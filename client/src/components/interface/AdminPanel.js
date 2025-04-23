import React, { useContext, useEffect, useState } from "react";
import AdminContext from "../../context/admin/adminContext";

const AdminPanel = () => {
  const {
    requests,
    users,
    loading,
    getRequests,
    getUsers,
    deleteUser,
    logoutUser,
    inviteUser, // from context
  } = useContext(AdminContext);

  const [inviteData, setInviteData] = useState({
    name: "",
    email: "",
    roleRequested: "agent",
    marketingAccess: false,
  });

  const onInviteChange = (e) => {
    const { name, value, type, checked } = e.target;
    setInviteData({
      ...inviteData,
      [name]: type === "checkbox" ? checked : value,
    });
  };

  const sendInvite = async () => {
    await inviteUser(inviteData);
    setInviteData({
      name: "",
      email: "",
      roleRequested: "agent",
      marketingAccess: false,
    });
    getRequests();
  };

  useEffect(() => {
    getRequests();
    getUsers();
  }, []);

  return (
    <div className="container">
      <h2 className="mb-1">Admin Panel</h2>

      <div className="card mb-2">
        <h3>Invite New User</h3>
        <input
          type="text"
          name="name"
          placeholder="Full Name"
          value={inviteData.name}
          onChange={onInviteChange}
        />
        <input
          type="email"
          name="email"
          placeholder="Email"
          value={inviteData.email}
          onChange={onInviteChange}
        />
        <select
          name="roleRequested"
          value={inviteData.roleRequested}
          onChange={onInviteChange}
        >
          <option value="agent">Agent</option>
          <option value="admin">Admin</option>
        </select>
        <label>
          <input
            type="checkbox"
            name="marketingAccess"
            checked={inviteData.marketingAccess}
            onChange={onInviteChange}
          />
          &nbsp; Marketing Access
        </label>
        <button className="btn btn-outline" onClick={sendInvite}>
          Send Invite
        </button>
      </div>

      <div className="card mb-2">
        <h3>Outstanding Invites</h3>
        {loading ? (
          <p>Loading...</p>
        ) : (
          <ul>
            {requests
              .filter((req) => req.status === "invited")
              .map((req) => (
                <li key={req._id} className="mb-1">
                  <strong>{req.name}</strong> - {req.email} -{" "}
                  {req.roleRequested} {req.marketingAccess && "[Marketing]"}
                </li>
              ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h3>Active Users</h3>
        {loading ? (
          <p>Loading...</p>
        ) : (
          <ul>
            {users.map((user) => (
              <li key={user._id} className="mb-1">
                <strong>{user.email}</strong> - {user.role} <br />
                Last Login: {user.lastLogin || "Never"} <br />
                <button
                  className="btn btn-outline"
                  onClick={() => logoutUser(user._id)}
                >
                  Force Logout
                </button>
                <button
                  className="btn btn-outline"
                  onClick={() => deleteUser(user._id)}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;
