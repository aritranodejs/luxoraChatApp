import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Modal from "react-modal";
import { globalUsers, friends, addFriend } from "../services/friendService";

Modal.setAppElement("#root");

const FriendsList = ({ searchQuery, onAddFriend, onSelectChat }) => {
  const [users, setUsers] = useState([]);
  const [friendsList, setFriendsList] = useState([]);
  const [modalIsOpen, setModalIsOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        let globalUsersData = await globalUsers();
        globalUsersData = globalUsersData?.data;

        let friendsData = await friends();
        friendsData = friendsData?.data?.friends;

        // Mark users as friends
        const updatedUsers = globalUsersData.map(user => ({
          ...user,
          isFriend: friendsData.some(friend => friend.id === user.id),
        }));

        setUsers([ ...updatedUsers]);
        setFriendsList(friendsData);
      } catch (error) {
        console.error("Error fetching users:", error);
      }
    };

    fetchUsers();
  }, []);

  const filteredUsers = users.filter((user) => {
    const searchLower = searchQuery.toLowerCase();
    const userNameLower = user.name.toLowerCase();
    const matchesSearch = userNameLower.includes(searchLower);
    const isFriend = friendsList.some((friend) => friend.id === user.id);

    return searchQuery.trim() === "" ? isFriend : matchesSearch;
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
              searchQuery.trim() !== "" && !user.isAI && (
                <button
                  className="btn btn-success btn-sm"
                  onClick={() => openModal(user)}
                >
                  Add Friend
                </button>
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
                  onAddFriend(selectedUser?.id);
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