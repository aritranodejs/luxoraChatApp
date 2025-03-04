import React, { useState, useRef, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { Modal } from "react-bootstrap";
import { getFriendRequests, acceptOrRejectRequest } from "../services/friendService";
import "@fortawesome/fontawesome-free/css/all.min.css";
import Swal from "sweetalert2";

const Profile = ({ isDarkMode, toggleTheme }) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [notifications, setNotifications] = useState(1);
  const [friendRequests, setFriendRequests] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const dropdownRef = useRef(null);
  const { handleMe, handleLogout } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async (e) => {
    e.preventDefault();
    try {
      await handleLogout();
      navigate("/login");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const toggleDropdown = () => setDropdownOpen(!dropdownOpen);
  const handleClickOutside = (event) => {
    if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
      setDropdownOpen(false);
    }
  };

  const handleNotificationClick = async () => {
    try {
        const response = await getFriendRequests();
        console.log("Friend Requests:", response?.data?.friendRequests);

        const formattedRequests = response?.data?.friendRequests.map((request) => ({
            requestId: request.id, 
            senderId: request.senderId,
            receiverId: request.receiverId,
            status: request.status,
            ...request.friendInfo, 
        })) || [];

        console.log("Formatted Friend Requests:", formattedRequests);

        setFriendRequests(formattedRequests);
        setModalOpen(true);
        setNotifications(0); 
    } catch (error) {
        console.error("Failed to fetch friend requests:", error);
    }
  };

  const handleAcceptOrRejectRequest = async (friendId, status) => {
    try {
        const response = await acceptOrRejectRequest(friendId, status);
        console.log("Accept/Reject Response:", response);
        
        Swal.fire({
            icon: "success",
            title: "Success",
            text: response?.message || "Friend request has been accepted successfully.",
            timer: 2000,
            showConfirmButton: false,
        });
        setFriendRequests((prev) => prev.filter((req) => req.requestId !== friendId)); 
    } catch (error) {
        console.error("Error accepting/rejecting friend request:", error);
    }
  };

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const userData = await handleMe();
        setUser(userData?.data);
      } catch (error) {
        console.error("Failed to fetch user data:", error);
      }
    };

    fetchUserData();
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [handleMe]);

  return (
    <div className="profile-container d-flex align-items-center mb-3 p-2">
      <div className="profile-avatar bg-success text-white rounded-circle d-flex align-items-center justify-content-center me-2">
        {user?.name ? user.name[0] : "U"}
      </div>
      <div className="profile-info flex-grow-1">
        <div className="profile-name">{user?.name || "User"}</div>
        <div className="profile-status text-success">{user?.isOnline ? "Active Now" : "Offline"}</div>
      </div>

      {/* Notification Icon */}
      <div className="profile-notifications me-3 position-relative">
        <button className="btn p-0" onClick={handleNotificationClick}>
          <i className="fas fa-bell" style={{ fontSize: "22px", color: "#555" }}></i>
        </button>
        {notifications > 0 && (
          <span className="notification-badge">{notifications}</span>
        )}
      </div>

      {/* Profile Options Dropdown */}
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
            <div className="profile-dropdown-item" onClick={handleSignOut}>Sign Out</div>
          </div>
        )}
      </div>

      {/* Friend Requests Modal */}
      <Modal show={modalOpen} onHide={() => setModalOpen(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Friend Requests</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {friendRequests.length === 0 ? (
            <p className="text-center">No new friend requests.</p>
          ) : (
            <ul className="list-group">
              {friendRequests.map((request) => (
                <li key={request?.requestId} className="list-group-item d-flex justify-content-between align-items-center">
                  <span>
                    {request?.name}
                    <br />
                    <small>{request?.email}</small>
                  </span>
                  <div>
                    <button className="btn btn-success btn-sm me-2" onClick={() => handleAcceptOrRejectRequest(request?.requestId, "accepted")}>
                      Accept
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleAcceptOrRejectRequest(request?.requestId, "rejected")}>
                      Reject
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Modal.Body>
      </Modal>
    </div>
  );
};

export default Profile;