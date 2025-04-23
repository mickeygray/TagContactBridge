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

  return (
    <nav className="navbar p-1 mb-1 card grid grid-2">
      <div>
        <Link to="/" className="logo">
          📇 TagContactBridge
        </Link>
      </div>
      <div className="grid" style={{ justifyContent: "end", gap: "1rem" }}>
        {isAuthenticated && (
          <>
            {user.role === "admin" && (
              <>
                <Link to="/admin" className="btn btn-outline">
                  Admin
                </Link>
              </>
            )}
            {user.marketingAccess && (
              <>
                <Link to="/management" className="btn btn-outline">
                  Marketing Tools
                </Link>
                <Link to="/agent" className="btn btn-outline">
                  Agent Dashboard
                </Link>
              </>
            )}
            {user.role === "agent" && (
              <Link to="/agent" className="btn btn-outline">
                Agent Dashboard
              </Link>
            )}
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
