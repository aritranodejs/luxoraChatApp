import React, { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import Modal from "react-modal";
import { globalUsers, friends, getPendingRequests, addFriend, cancelRequest } from "../services/friendService";
import Swal from "sweetalert2";
import { getUser } from "../utils/authHelper";
import io from 'socket.io-client';
import "../styles/FriendsList.css";

Modal.setAppElement("#root");

const FriendsList = ({ searchQuery, onSelectChat }) => {
  const [users, setUsers] = useState([]);
  const [friendsList, setFriendsList] = useState([]);
  const [modalIsOpen, setModalIsOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const socket = useRef(null);
  const url = process.env.REACT_APP_SOCKET_URL || "http://localhost:5000";

  const handleAddFriend = async (receiverId) => {
    try {
      const response = await addFriend(receiverId);
      fetchUsersAndFriends();
      Swal.fire({
        icon: "success",
        title: "Success",
        text: response?.message || "Friend request sent successfully!",
        timer: 2000,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error("Error adding friend:", error);
    }
  }

  const handleCancelRequest = async (friendId) => {
    if (!friendId) {
      Swal.fire({
        icon: "error",
        title: "Oops...",
        text: "Friend ID is missing!",
      });
      return;
    }

    try {
      const result = await Swal.fire({
        title: "Are you sure?",
        text: "Do you really want to cancel the friend request?",
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#d33",
        cancelButtonColor: "#3085d6",
        confirmButtonText: "Yes, cancel it!",
      });

      if (result.isConfirmed) {
        const response = await cancelRequest(friendId); 
        const message = response.message || "Your friend request has been canceled.";

        Swal.fire({
          title: "Cancelled!",
          text: message, 
          icon: "success",
          timer: 2000,
          showConfirmButton: false,
        });

        fetchUsersAndFriends(); 
      }
    } catch (error) {
      Swal.fire({
        icon: "error",
        title: "Error",
        text: error.response?.data?.message || "Failed to cancel the friend request. Please try again.",
      });
      console.error("Error canceling request:", error);
    }
  };  

  const fetchUsersAndFriends = useCallback(async () => {
    try {
      let globalUsersData = await globalUsers();
      globalUsersData = globalUsersData?.data || [];
  
      let friendsData = await friends();
      friendsData = friendsData?.data?.friends || [];
  
      let pendingRequests = await getPendingRequests();
      pendingRequests = pendingRequests?.data?.friends || [];

      // Initialize socket connection
      if (!socket.current) {
        socket.current = io(url);
        const userId = getUser()?.id;
        socket.current.emit('userId', userId);

        // Listen for friend list updates
        socket.current.on('friendListUpdated', (data) => {
          const { updatedUsers, extractedFriendsList } = getUsersAndFriends(
            data?.users || [],
            data?.friends || [],
            data?.pendingFriends || []
          );
          setUsers(updatedUsers);
          setFriendsList(extractedFriendsList);
        }); 

        // Listen for real-time status changes
        socket.current.on('userStatusChanged', (data) => {
          setUsers(prevUsers => {
            return prevUsers.map(user => {
              if (user.id === data.userId) {
                return {
                  ...user,
                  isOnline: data.isOnline,
                  lastSeen: data.lastSeen
                };
              }
              return user;
            });
          });

          setFriendsList(prevFriends => {
            return prevFriends.map(friend => {
              if (friend.id === data.userId) {
                return {
                  ...friend,
                  isOnline: data.isOnline,
                  lastSeen: data.lastSeen
                };
              }
              return friend;
            });
          });
        });
      }
  
      const { updatedUsers, extractedFriendsList } = getUsersAndFriends(globalUsersData, friendsData, pendingRequests);

      setUsers(updatedUsers);
      setFriendsList(extractedFriendsList);
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  }, [url]); 

  const getUsersAndFriends = (globalUsersData, friendsData, pendingRequests) => {
    let extractedFriendsList = friendsData.map((friend) => ({
      friendId: friend?.id,
      senderId: friend?.senderId,
      receiverId: friend?.receiverId,
      ...friend.friendInfo,
    }));

    const updatedUsers = globalUsersData.map((user) => {
      const matchedFriend = extractedFriendsList.find(
        (friend) => friend.senderId === user.id || friend.receiverId === user.id
      );
    
      const matchedPendingRequest = pendingRequests.find(
        (request) => request.senderId === user.id || request.receiverId === user.id
      );
    
      return {
        friendId: matchedFriend 
          ? matchedFriend.friendId  
          : matchedPendingRequest
          ? matchedPendingRequest.id  
          : null,  
    
        ...user,
        isFriend: friendsData.some((friend) => friend?.friendInfo?.id === user.id),
        hasPendingRequest: pendingRequests.some((request) => request?.receiverId === user.id),
      };
    });

    return { extractedFriendsList, updatedUsers };
  }

  useEffect(() => {
    fetchUsersAndFriends();

    // Cleanup socket connection on unmount
    return () => {
      if (socket.current) {
        socket.current.off('userStatusChanged');
        socket.current.off('friendListUpdated');
      }
    };
  }, [fetchUsersAndFriends]);

  // Format last seen time
  const formatLastSeen = (lastSeen) => {
    if (!lastSeen) return "Unknown";
    
    const lastSeenDate = new Date(lastSeen);
    const now = new Date();
    const diffMs = now - lastSeenDate;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    
    return lastSeenDate.toLocaleDateString();
  };

  // Separate AI users and regular users, prioritizing AI users at the top
  const { aiUsers, regularUsers } = users.reduce((acc, user) => {
    if (user.isAI) {
      acc.aiUsers.push(user);
    } else {
      acc.regularUsers.push(user);
    }
    return acc;
  }, { aiUsers: [], regularUsers: [] });

  // Filter AI users if there's a search query
  const filteredAiUsers = searchQuery.trim() === "" 
    ? aiUsers 
    : aiUsers.filter(user => user.name.toLowerCase().includes(searchQuery.toLowerCase()));

  // Filter regular users based on search criteria
  const filteredRegularUsers = regularUsers.filter((user) => {
    const searchLower = searchQuery.toLowerCase();
    const userNameLower = user.name.toLowerCase();
    const matchesSearch = userNameLower.includes(searchLower);
    const isFriend = friendsList.some((friend) => friend.id === user.id);
  
    const currentUserId = getUser().id;
    const isSenderRequest = user.hasPendingRequest && user.id === currentUserId;
  
    return searchQuery.trim() === "" 
      ? isFriend 
      : matchesSearch && !isSenderRequest; // Exclude if you have sent a request
  });

  // Always show AI users (filtered if searching), then show filtered regular users
  const filteredUsers = [...filteredAiUsers, ...filteredRegularUsers];

  const openModal = (user) => {
    setSelectedUser(user);
    setModalIsOpen(true);
  };

  const closeModal = () => {
    setModalIsOpen(false);
    setSelectedUser(null);
  };

  const customStyles = {
    content: {
      top: "50%",
      left: "50%",
      right: "auto",
      bottom: "auto",
      marginRight: "-50%",
      transform: "translate(-50%, -50%)",
      width: "300px",
      padding: "20px",
      borderRadius: "8px",
      boxShadow: "0 4px 8px rgba(0, 0, 0, 0.1)",
    },
    overlay: {
      backgroundColor: "rgba(0, 0, 0, 0.5)",
    },
  };

  return (
    <div>
      <ul className="list-group list-group-flush">
        {filteredUsers.map((user) => (
          <li
            key={user.id}
            className="list-group-item d-flex align-items-center justify-content-between"
            onClick={() => onSelectChat()}
          >
            <div className="d-flex align-items-center flex-grow-1">
              <div
                className={`me-2 ${user.isAI ? 'bg-primary' : 'bg-secondary'} text-white rounded-circle d-flex justify-content-center align-items-center`}
                style={{ width: "40px", height: "40px" }}
              >
                {user.name.charAt(0)}
              </div>
              <div className="d-flex flex-column">
                <div className="d-flex align-items-center">
                  <Link
                    to={`/chat/${user?.slug}`}
                    className="text-decoration-none text-dark"
                  >
                    {user.name}
                  </Link>
                  {user.isAI && <span className="ai-icon ms-2">AI Assistant</span>}
                </div>
                {user.isFriend && (
                  <small className={user.isOnline ? "text-success" : "text-muted"}>
                    {user.isOnline ? "Active now" : user.lastSeen ? `Last seen ${formatLastSeen(user.lastSeen)}` : "Offline"}
                  </small>
                )}
              </div>
            </div>
            {user.isFriend ? (
              <span className="d-flex align-items-center">
                {user.isOnline && <span className="online-dot me-1"></span>}
              </span>
            ) : (
              !user.isFriend && searchQuery.trim() !== "" && !user.isAI && (
                user.hasPendingRequest ? (
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCancelRequest(user?.friendId);
                    }} 
                  >
                    Cancel
                  </button>
                ) : (
                  <button
                    className="btn btn-success btn-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      openModal(user);
                    }}
                  >
                    Add
                  </button>
                )
              )             
            )}
          </li>
        ))}
      </ul>

      {/* Add Friend Modal */}
      <Modal
        isOpen={modalIsOpen}
        onRequestClose={closeModal}
        contentLabel="Add Friend Modal"
        style={customStyles}
      >
        {selectedUser && (
          <div className="modal-content">
            <h5 className="mb-3">Add Friend</h5>
            <p className="mb-3">Do you want to add {selectedUser?.name} as a friend?</p>
            <div className="d-flex justify-content-end">
              <button
                className="btn btn-success btn-sm me-2"
                onClick={() => {
                  handleAddFriend(selectedUser?.id);
                  closeModal();
                }}
              >
                Confirm
              </button>
              <button className="btn btn-secondary btn-sm" onClick={closeModal}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default FriendsList;