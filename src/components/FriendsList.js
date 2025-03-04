import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Modal from "react-modal";
import { globalUsers, friends, getPendingRequests, addFriend, cancelRequest } from "../services/friendService";
import Swal from "sweetalert2";
import { getUser } from "../utils/authHelper";

Modal.setAppElement("#root");

const FriendsList = ({ searchQuery, onSelectChat }) => {
  const [users, setUsers] = useState([]);
  const [friendsList, setFriendsList] = useState([]);
  const [modalIsOpen, setModalIsOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

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

  const fetchUsersAndFriends = async () => {
    try {
      let globalUsersData = await globalUsers();
      globalUsersData = globalUsersData?.data || [];
  
      let friendsData = await friends();
      friendsData = friendsData?.data?.friends || [];
  
      let pendingRequests = await getPendingRequests();
      pendingRequests = pendingRequests?.data?.friends || [];
  
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
  
      setUsers(updatedUsers);
      setFriendsList(extractedFriendsList);
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  };   

  useEffect(() => {
    fetchUsersAndFriends();
  }, []);

  const filteredUsers = users.filter((user) => {
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
            {user.isAI && <span className="ai-icon"></span>}
            <div
              className="me-2 bg-secondary text-white rounded-circle d-flex justify-content-center align-items-center"
              style={{ width: "40px", height: "40px" }}
            >
              {user.name.charAt(0)}
            </div>
            <Link
              to={`/chat/${user?.slug}`}
              className="text-decoration-none flex-grow-1 text-dark"
            >
              {user.name}
            </Link>
            {user.isFriend ? (
              <span className="d-flex align-items-center">
                {user.isOnline ? (
                  <>
                    <span className="online-dot me-1"></span>
                    <span className="text-success">{user.isAI ? "AI" : "Active now"}</span>
                  </>
                ) : (
                  <span className="text-muted">Offline</span>
                )}
              </span>
            ) : (
              !user.isFriend && searchQuery.trim() !== "" && !user.isAI && (
                user.hasPendingRequest ? (
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleCancelRequest(user?.friendId)} 
                  >
                    Cancel
                  </button>
                ) : (
                  <button
                    className="btn btn-success btn-sm"
                    onClick={() => openModal(user)}
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