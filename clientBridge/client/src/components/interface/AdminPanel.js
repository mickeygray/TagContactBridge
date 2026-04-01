import React, { useEffect, useState } from "react";
import { api } from "../../utils/api";
import { toast } from "../../utils/toast";

const AdminPanel = () => {
  const [requests, setRequests] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [inviteData, setInviteData] = useState({
    name: "",
    email: "",
    roleRequested: "agent",
    marketingAccess: false,
  });

  const getRequests = async () => {
    try {
      const res = await api.get("/api/invite/requests");
      setRequests(res.data || []);
    } catch (err) {
      toast.error("Error", err.message);
    }
  };

  const getUsers = async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/admin/users");
      setUsers(res.data || []);
    } catch (err) {
      toast.error("Error", err.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteUser = async (id) => {
    try {
      await api.delete(`/api/admin/users/${id}`);
      toast.success("User", "Deleted");
      getUsers();
    } catch (err) {
      toast.error("Error", err.message);
    }
  };

  const logoutUser = async (id) => {
    try {
      await api.post(`/api/admin/users/${id}/logout`);
      toast.success("User", "Logged out");
    } catch (err) {
      toast.error("Error", err.message);
    }
  };

  const inviteUser = async () => {
    try {
      await api.post("/api/invite", inviteData);
      toast.success("Invite", "Sent");
      setInviteData({ name: "", email: "", roleRequested: "agent", marketingAccess: false });
      getRequests();
    } catch (err) {
      toast.error("Error", err.message);
    }
  };

  const onInviteChange = (e) => {
    const { name, value, type, checked } = e.target;
    setInviteData({ ...inviteData, [name]: type === "checkbox" ? checked : value });
  };

  useEffect(() => {
    getRequests();
    getUsers();
  }, []);

  return (
    <div className="dashboard">
      <h2 className="dashboard-title mb-4">Admin Panel</h2>

      <div className="card mb-3">
        <div className="card-header"><span className="card-title">Invite New User</span></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input type="text" name="name" placeholder="Full Name" value={inviteData.name} onChange={onInviteChange} />
          <input type="email" name="email" placeholder="Email" value={inviteData.email} onChange={onInviteChange} />
          <select name="roleRequested" value={inviteData.roleRequested} onChange={onInviteChange}>
            <option value="agent">Agent</option>
            <option value="admin">Admin</option>
          </select>
          <label>
            <input type="checkbox" name="marketingAccess" checked={inviteData.marketingAccess} onChange={onInviteChange} />
            {" "}Marketing Access
          </label>
          <button className="btn btn-solid" onClick={inviteUser}>Send Invite</button>
        </div>
      </div>

      <div className="card mb-3">
        <div className="card-header"><span className="card-title">Outstanding Invites</span></div>
        {loading ? <p className="text-muted">Loading...</p> : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {requests.filter((r) => r.status === "invited").map((r) => (
              <li key={r._id} style={{ marginBottom: 8 }}>
                <strong>{r.name}</strong> — {r.email} — {r.roleRequested}
                {r.marketingAccess && <span className="badge badge-blue ml-1">Marketing</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">Active Users</span></div>
        {loading ? <p className="text-muted">Loading...</p> : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {users.map((u) => (
              <li key={u._id} style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <strong>{u.email}</strong> <span className="badge badge-muted">{u.role}</span>
                  <div className="text-xs text-muted">Last login: {u.lastLogin || "Never"}</div>
                </div>
                <button className="btn btn-sm btn-yellow" onClick={() => logoutUser(u._id)}>Logout</button>
                <button className="btn btn-sm btn-red" onClick={() => deleteUser(u._id)}>Delete</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;
