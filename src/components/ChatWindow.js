import React, { useState } from "react";

const ChatWindow = ({ friendId, onClose }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const friend = { id: 3, name: "Charlie", isOnline: true }; // Mock friend data

  const sendMessage = () => {
    if (input.trim() !== "") {
      setMessages([...messages, { sender: "You", text: input }]);
      setInput("");
    }
  };

  return (
    <div className="chat-window d-flex flex-column w-100 h-100 p-3">
      <div className="chat-header bg-light p-2 border-bottom d-flex align-items-center">
        <div
          className="me-2 bg-secondary text-white rounded-circle d-flex justify-content-center align-items-center"
          style={{ width: "40px", height: "40px" }}
        >
          {friend.name.charAt(0)}
        </div>
        <div className="flex-grow-1">
          <h5 className="mb-0">{friend.name}</h5>
          <span className="d-flex align-items-center">
            {friend.isOnline ? (
              <>
                <span className="online-dot me-1"></span>
                <span className="text-success">Active now</span>
              </>
            ) : (
              <span className="text-muted">Offline</span>
            )}
          </span>
        </div>
      </div>
      <div className="chat-body flex-grow-1 overflow-auto p-3">
        {messages.map((msg, index) => (
          <div key={index} className={`d-flex ${msg.sender === "You" ? "justify-content-end" : "justify-content-start"}`}>
            <div className={`p-2 rounded-3 ${msg.sender === "You" ? "bg-primary text-white" : "bg-secondary text-white"}`}>
              {msg.text}
            </div>
          </div>
        ))}
      </div>
      <div className="chat-footer d-flex p-2 border-top">
        <input type="text" className="form-control" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type a message..." />
        <button className="btn btn-primary ms-2" onClick={sendMessage}>Send</button>
      </div>
    </div>
  );
};

export default ChatWindow;