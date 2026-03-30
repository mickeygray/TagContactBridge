import React, { useContext } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthContext from "../../context/auth/authContext";

const Navbar = () => {
  const { user, isAuthenticated, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };
  const oauthEnabled = process.env.REACT_APP_ENABLE_OAUTH === "true";
  return (
    <nav className="navbar p-1 mb-1 card grid grid-2">
      <div>📇 TagContactBridge</div>
      <div className="grid" style={{ justifyContent: "end", gap: "1rem" }}>
        {isAuthenticated && (
          <>
            <Link to="/" className="btn btn-outline">
              Marketing Tools
            </Link>
            <Link to="/ringbridge" className="btn btn-outline">
              RingBridge
            </Link>
            <Link to="/deploy" className="btn btn-outline">
              Deploy
            </Link>

            <button className="btn btn-outline" onClick={handleLogout}>
              Logout
            </button>
          </>
        )}
        {!isAuthenticated && (
          <>
            <Link to="/login" className="btn btn-outline">
              Login
            </Link>
            <div className="login-page">
              <h1>Sign In</h1>
              {oauthEnabled ? (
                <a href="/auth/google" className="button google">
                  Sign in with Google
                </a>
              ) : (
                <p>
                  <em>
                    Google sign‑in is disabled in development; use local
                    credentials below.
                  </em>
                </p>
              )}

              {/* always render your local/email+password form */}
              <form /* … your form handler … */>
                {/* email/password inputs, submit button */}
              </form>
            </div>
            <Link to="/register" className="btn btn-outline">
              Register
            </Link>
          </>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
