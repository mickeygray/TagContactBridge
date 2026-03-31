import React, { useContext } from "react";
import { useNavigate } from "react-router-dom";
import AuthContext from "../../context/auth/authContext";

const Navbar = () => {
  const { isAuthenticated } = useContext(AuthContext);
  const navigate = useNavigate();

  return (
    <nav className="navbar p-1 mb-1 card grid grid-2">
      <div>📇 TagContactBridge</div>
      <div className="grid" style={{ justifyContent: "end", gap: "1rem" }}>
        {isAuthenticated ? (
          <>
            <button className="btn btn-outline" onClick={() => navigate("/")}>
              Marketing Tools
            </button>
            <button
              className="btn btn-outline"
              onClick={() => navigate("/ringbridge")}
            >
              RingBridge
            </button>
            <button
              className="btn btn-outline"
              onClick={() => navigate("/deploy")}
            >
              Deploy
            </button>
            <button
              className="btn btn-outline"
              onClick={() => (window.location.href = "/logout")}
            >
              Logout
            </button>
          </>
        ) : (
          <button
            className="btn btn-outline"
            onClick={() => (window.location.href = "/login")}
          >
            Login
          </button>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
