import React, { useState, useContext, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AuthContext from "../../context/auth/authContext";

const Login = () => {
  const { login, user, isAuthenticated } = useContext(AuthContext);
  const navigate = useNavigate();

  const [formData, setFormData] = useState({ email: "", password: "" });
  const [error, setError] = useState("");

  const onChange = (e) =>
    setFormData({ ...formData, [e.target.name]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    try {
      await login(formData.email, formData.password);
    } catch (err) {
      setError("Invalid credentials");
    }
  };
  useEffect(() => {
    if (isAuthenticated && user) {
      if (user.role === "admin") navigate("/admin");
      else if (user.role === "agent" || user.role === "agent")
        navigate("/agent");
      else navigate("/unauthorized");
    }
  }, [isAuthenticated, user, navigate]);
  return (
    <div className="container">
      <div className="card">
        <h2 className="mb-1">Login</h2>
        {error && <p style={{ color: "red" }}>{error}</p>}
        <form onSubmit={onSubmit}>
          <label>Email</label>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={onChange}
            required
          />

          <label>Password</label>
          <input
            type="password"
            name="password"
            value={formData.password}
            onChange={onChange}
            required
          />

          <button className="btn mt-1" type="submit">
            Login
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
