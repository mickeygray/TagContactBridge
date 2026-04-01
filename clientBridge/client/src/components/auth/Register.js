import React, { useState, useEffect, useContext } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AuthContext from "../../context/auth/authContext";

const Register = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const { validateInvite, completeInvite } = useContext(AuthContext);

  const [formData, setFormData] = useState({
    email: "",
    name: "",
    password: "",
    confirmPassword: "",
  });
  const [passwordError, setPasswordError] = useState("");
  const [matchError, setMatchError] = useState("");

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [inviteValid, setInviteValid] = useState(false);

  useEffect(() => {
    const checkInvite = async () => {
      try {
        const data = await validateInvite(token);
        console.log(data);
        setFormData((prev) => ({
          ...prev,
          email: data.email,
          name: data.name,
        }));
        setInviteValid(true);
      } catch {
        setError("Invalid or expired invite link.");
      }
    };
    checkInvite();
  }, [token]);

  const onChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });

    if (name === "password") {
      if (!validatePassword(value)) {
        setPasswordError(
          "❌ Must include uppercase, lowercase, number, symbol, 8+ characters"
        );
      } else {
        setPasswordError("");
      }
    }

    if (name === "confirmPassword" || name === "password") {
      const pw = name === "password" ? value : formData.password;
      const confirm =
        name === "confirmPassword" ? value : formData.confirmPassword;

      if (confirm && pw !== confirm) {
        setMatchError("❌ Passwords do not match");
      } else {
        setMatchError("");
      }
    }
  };

  const validatePassword = (pw) => {
    const strongRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*]).{8,}$/;
    return strongRegex.test(pw);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const { password, confirmPassword } = formData;

    if (password !== confirmPassword) {
      return setError("Passwords do not match.");
    }

    if (!validatePassword(password)) {
      return setError(
        "Password must be 8+ characters with uppercase, lowercase, number, and symbol."
      );
    }

    try {
      await completeInvite(token, password);
      setMessage("✅ Account created! You can now log in.");
      setTimeout(() => navigate("/login"), 1500);
    } catch (err) {
      setError(err.response?.data?.message || "Error registering.");
    }
  };

  if (!inviteValid && !error) return <p>Verifying your invite...</p>;

  return (
    <div className="container">
      <div className="card">
        <h2 className="mb-1">Complete Your Registration</h2>
        {message && <p style={{ color: "green" }}>{message}</p>}
        {error && <p style={{ color: "red" }}>{error}</p>}
        {inviteValid && (
          <form onSubmit={onSubmit}>
            <p>
              Registering for: <strong>{formData.email}</strong>
            </p>
            <label>Password</label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={onChange}
              required
            />
            {passwordError && (
              <p style={{ color: "red", marginTop: "0.25rem" }}>
                {passwordError}
              </p>
            )}

            <label>Confirm Password</label>
            <input
              type="password"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={onChange}
              required
            />
            {matchError && (
              <p style={{ color: "red", marginTop: "0.25rem" }}>{matchError}</p>
            )}
            <button type="submit" className="btn mt-1">
              Create Account
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default Register;
