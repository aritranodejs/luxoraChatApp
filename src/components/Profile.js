import React, { useState, useRef, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { getUser } from "../utils/authHelper";
import { useNavigate } from "react-router-dom";
import { Modal } from "react-bootstrap";
import { getFriendRequests, acceptOrRejectRequest } from "../services/friendService";
import { updateUserOnlineStatus } from "../services/userService";
import "@fortawesome/fontawesome-free/css/all.min.css";
import Swal from "sweetalert2";
import io from 'socket.io-client';

const Profile = ({ isDarkMode, toggleTheme }) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [notifications, setNotifications] = useState(0);
  const [friendRequests, setFriendRequests] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [status, setStatus] = useState(false);
  const dropdownRef = useRef(null);
  const { handleMe, handleLogout } = useAuth();
  const navigate = useNavigate();
  const socket = useRef(null);
  const url = process.env.REACT_APP_SOCKET_URL || "http://localhost:5000";

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
        setModalOpen(true);
    } catch (error) {
        console.error("Failed to fetch friend requests:", error);
    }
  };

  const handleAcceptOrRejectRequest = async (friendId, status) => {
    try {
        const response = await acceptOrRejectRequest(friendId, status);
        setNotifications((prev) => prev - 1);
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
    let socketInitialized = false;

    const fetchUserData = async () => {
      try {
        socket.current = io(url); // Initialize socket connection
        const userId = getUser()?.id;
        socket.current.emit('userId', userId);

        // Listen for online status updates
        socket.current.on('online-status', (data) => {
          setStatus(data?.isOnline);
        }); 

        const userData = await handleMe();
        setUser(userData?.data);

        const response = await getFriendRequests();
        let formattedRequests = response?.data?.friendRequests.map((request) => ({
            requestId: request.id, 
            senderId: request.senderId,
            receiverId: request.receiverId,
            status: request.status,
            ...request.friendInfo, 
        })) || [];

        setFriendRequests(formattedRequests);
        setNotifications(formattedRequests.length);

        // Initialize socket connection after user data is fetched
        if (userData?.data?.id) {
          // Update online status on connection
          updateUserOnlineStatus(userData.data.id, true);

          // Listen for friend requests
          socket.current.on('friendRequests', (data) => {
            formattedRequests = data?.friendRequests.map((request) => ({
              requestId: request.id, 
              senderId: request.senderId,
              receiverId: request.receiverId,
              status: request.status,
              ...request.friendInfo, 
            })) || [];

            setFriendRequests(formattedRequests);
            setNotifications(data.count);
          });

          // Optimized real-time handling (no debouncing)
          const handleVisibilityChange = () => {
            if (document.hidden) {
              if (socket.current && socket.current.connected) {
                updateUserOnlineStatus(userData?.data?.id, false);  // Set to offline immediately
              }
            } else {
              if (socket.current && socket.current.connected) {
                updateUserOnlineStatus(userData?.data?.id, true);  // Set to online immediately
              }
            }
          };

          const handleBeforeUnload = () => {
            if (socket.current && socket.current.connected) {
              updateUserOnlineStatus(userData?.data?.id, false);  // User closed browser
            }
          };

          // Only add event listeners once
          if (!socketInitialized) {
            document.addEventListener('visibilitychange', handleVisibilityChange);
            window.addEventListener('beforeunload', handleBeforeUnload);
            socketInitialized = true;  // Prevent multiple initializations
          }

          return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('beforeunload', handleBeforeUnload);
            if (socket.current) {
              socket.current.disconnect();  // Disconnect socket on unmount
            }
            socketInitialized = false;  // Reset the flag on unmount
          };
        }
      } catch (error) {
        console.error("Failed to fetch user data:", error);
      }
    };

    fetchUserData();
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [handleMe, url]);

  return (
    <div className="profile-container d-flex align-items-center mb-3 p-2">
      <div className="profile-avatar bg-success text-white rounded-circle d-flex align-items-center justify-content-center me-2">
        {user?.name ? user.name[0] : "U"}
      </div>
      <div className="profile-info flex-grow-1">
        <div className="profile-name">{user?.name || "User"}</div>
        <div className="profile-status text-success">{status ? "Active Now" : "Offline"}</div>
      </div>

      {/* Notification Icon */}
      <div className="profile-notifications me-3 position-relative">
        <button className="btn p-0" onClick={handleNotificationClick}>
          <i className="fas fa-bell notification-icon" style={{ fontSize: "22px", color: "#555" }}></i>
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
            <p className="text-center no-friend-requests">No new friend requests.</p>
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