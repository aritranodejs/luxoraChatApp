import React, { useState } from "react";
import { Link } from "react-router-dom";
import Modal from "react-modal";

Modal.setAppElement("#root");

const FriendsList = ({ searchQuery, friends, onAddFriend, onSelectChat }) => {
  const users = [
    { id: 1, name: "Alice", isOnline: true, isFriend: true },
    { id: 2, name: "Bob", isOnline: false, isFriend: true },
    { id: 3, name: "Charlie", isOnline: true, isFriend: false },
    { id: 4, name: "David", isOnline: false, isFriend: false },
  ];

  const [modalIsOpen, setModalIsOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  const filteredUsers = users.filter((user) => {
    const searchLower = searchQuery.toLowerCase();
    const userNameLower = user.name.toLowerCase();
    const matchesSearch = userNameLower.includes(searchLower);
    const isFriend = friends.some((friend) => friend.id === user.id);

    if (searchQuery.trim() === "") {
      return isFriend;
    } else {
      return matchesSearch;
    }
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
            <div
              className="me-2 bg-secondary text-white rounded-circle d-flex justify-content-center align-items-center"
              style={{ width: "40px", height: "40px" }}
            >
              {user.name.charAt(0)}
            </div>
            <Link
              to={`/chat/${user.id}`}
              className="text-decoration-none flex-grow-1 text-dark"
            >
              {user.name}
            </Link>
            {friends.some((friend) => friend.id === user.id) ? (
              <span className="d-flex align-items-center">
                {user.isOnline ? (
                  <>
                    <span className="online-dot me-1"></span>
                    <span className="text-success">Active now</span>
                  </>
                ) : (
                  <span className="text-muted">Offline</span>
                )}
              </span>
            ) : (
              searchQuery.trim() !== "" && (
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

      <Modal
        isOpen={modalIsOpen}
        onRequestClose={closeModal}
        contentLabel="Add Friend Modal"
        style={customStyles}
      >
        {selectedUser && (
          <div className="modal-content">
            <h5 className="mb-3">Add Friend</h5>
            <p className="mb-3">Do you want to add {selectedUser.name} as a friend?</p>
            <div className="d-flex justify-content-end">
              <button
                className="btn btn-success btn-sm me-2"
                onClick={() => {
                  onAddFriend(selectedUser);
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