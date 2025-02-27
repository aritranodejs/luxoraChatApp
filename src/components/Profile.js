import React, { useState, useRef, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

const Profile = ({ isDarkMode, toggleTheme }) => { // Receive props
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const { handleLogout } = useAuth(); 
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      await handleLogout(); 
      navigate("/login");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const toggleDropdown = () => {
    setDropdownOpen(!dropdownOpen);
  };

  const handleClickOutside = (event) => {
    if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
      setDropdownOpen(false);
    }
  };

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div className="profile-container d-flex align-items-center mb-3 p-2">
      <div className="profile-avatar bg-success text-white rounded-circle d-flex align-items-center justify-content-center me-2">
        AD
      </div>
      <div className="profile-info flex-grow-1">
        <div className="profile-name">Aritra Dutta</div>
        <div className="profile-status">Set a status</div>
      </div>
      <div className="profile-options" ref={dropdownRef}>
        <span className="profile-dropdown-toggle" onClick={toggleDropdown}>
          ...
        </span>
        {dropdownOpen && (
          <div className="profile-dropdown-menu">
            <div className="profile-dropdown-item" onClick={toggleTheme}>
              {isDarkMode ? "Light Mode" : "Dark Mode"}
            </div>
            <div className="profile-dropdown-item">Settings</div>
            <div className="profile-dropdown-item" onClick={handleSubmit}>Sign Out</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Profile;