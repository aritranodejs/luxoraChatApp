import React, { useState, useEffect, useRef, useCallback } from "react";
import { FaPhoneAlt, FaVideo, FaPhoneSlash, FaPaperPlane } from "react-icons/fa";
import Peer from "peerjs";
import { io } from "socket.io-client";
import { updatePeerId, getFriend } from "../services/friendService";
import { getUser } from "../utils/authHelper";
import { getChats, sendMessages } from "../services/chatService"; // ✅ Import chat API functions

const ChatWindow = ({ friendSlug }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [onlineStatus, setOnlineStatus] = useState(false);
  const [friendPeerId, setFriendPeerId] = useState("");
  const [friendName, setFriendName] = useState("");
  const [friendId, setFriendId] = useState("");
  const [loading, setLoading] = useState(true);
  const [incomingCall, setIncomingCall] = useState(null);
  const [activeCall, setActiveCall] = useState(false);

  const myVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peer = useRef(null);
  const socket = useRef(null);
  const callInstance = useRef(null);
  const mediaStream = useRef(null);
  const url = process.env.REACT_APP_SOCKET_URL || "http://localhost:5000";
  const userId = getUser()?.id;
  const roomName = `room-${userId}-${friendId}`;

  useEffect(() => {
    socket.current = io(url);
    peer.current = new Peer();

    peer.current.on("open", async (id) => {
      const response = await updatePeerId(friendSlug, id);
      setFriendId(response?.data?.id);
      socket.current.emit("userId", userId);
    });

    // Join a chat room (Keep this for real-time updates)
    if (friendId) {
      socket.current.emit("joinChat", { room: roomName });
    }

    // Listen for Incoming Calls
    socket.current.on("incomingCall", ({ callerId }) => {
      setIncomingCall({ callerId });
    });

    // Listen for Incoming Messages
    socket.current.on("receiveMessage", ({ senderId, receiverId, message }) => {
      if (receiverId === userId || senderId === userId) {
        setMessages(prevMessages => [...prevMessages, { senderId, receiverId, text: message }]);
      }
    });

    return () => {
      peer.current.destroy();
      socket.current.disconnect();
    };
  }, [friendSlug, userId, url, roomName, friendId]);

  useEffect(() => {
    const fetchFriendData = async () => {
      try {
        const response = await getFriend(friendSlug);
        const friendData = response?.data?.friend;
        if (friendData) {
          setFriendName(friendData.name);
          setOnlineStatus(friendData.isOnline);
          setFriendPeerId(friendData.peerId);
        }
      } catch (error) {}
      setLoading(false);
    };

    if (friendSlug) fetchFriendData();
  }, [friendSlug]);

  useEffect(() => {
    const fetchChatHistory = async () => {
      try {
        const response = await getChats(friendSlug);

        console.log("Chat history response:", response?.data);
        
        if (response.status === 200) {
          setMessages(response?.data);
        }

      } catch (error) {
        console.error("Error fetching chat history:", error);
      }
    };

    if (friendSlug) fetchChatHistory();
  }, [friendSlug, messages]);

  const startCall = useCallback((type) => {
    if (!friendPeerId) {
      alert(`${friendName || "Your friend"} is offline.`);
      return;
    }

    navigator.mediaDevices.getUserMedia({ video: type === "video", audio: true })
      .then((userStream) => {
        setActiveCall(true);
        mediaStream.current = userStream;
        if (myVideoRef.current) myVideoRef.current.srcObject = userStream;
        const call = peer.current.call(friendPeerId, userStream);
        callInstance.current = call;
        call.on("stream", (remoteUserStream) => {
          if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteUserStream;
        });

        socket.current.emit("callUser", { callerId: userId, friendId });
      })
      .catch(error => alert("Error accessing media devices: " + error.message));
  }, [friendPeerId, friendName, userId, friendId]);

  const acceptCall = useCallback(() => {
    if (!incomingCall) return;

    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then((userStream) => {
        setActiveCall(true);
        mediaStream.current = userStream;
        if (myVideoRef.current) myVideoRef.current.srcObject = userStream;
        incomingCall.answer(userStream);
        incomingCall.on("stream", (remoteUserStream) => {
          if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteUserStream;
        });

        socket.current.emit("acceptCall", { callerId: incomingCall.callerId, friendSlug });
        setIncomingCall(null);
      })
      .catch(error => alert("Error accessing media devices: " + error.message));
  }, [incomingCall, friendSlug]);

  const rejectCall = useCallback(() => {
    socket.current.emit("rejectCall", { callerId: incomingCall.callerId, friendSlug });
    setIncomingCall(null);
  }, [incomingCall, friendSlug]);

  // Send Chat Message
  const sendMessage = async () => {
    if (input.trim() !== "") {
      try {
        await sendMessages(friendSlug, input);
        const newMessage = {
          senderId: userId,
          receiverId: friendId,
          text: input
        };

        setMessages(prevMessages => [...prevMessages, newMessage]);

        // Emit message to the chat room
        socket.current.emit("sendMessage", { room: roomName, ...newMessage });

        setInput("");
      } catch (error) {
        console.error("Error sending message:", error);
      }
    }
  };

  return (
    <div className="chat-window d-flex flex-column w-100 h-100 p-3">
      {loading ? (
        <div className="text-center mt-4">Loading chat...</div>
      ) : (
        <>
          <div className="chat-header bg-light p-2 border-bottom d-flex align-items-center justify-content-between">
            <div className="d-flex align-items-center">
              <div className="me-2 bg-secondary text-white rounded-circle d-flex justify-content-center align-items-center"
                style={{ width: "40px", height: "40px" }}>
                {friendName ? friendName.charAt(0) : "?"}
              </div>
              <div className="flex-grow-1">
                <h5 className="mb-0">{friendName || "Unknown"}</h5>
                <span className="text-success">{onlineStatus ? "Active now" : "Offline"}</span>
              </div>
            </div>
            <div className="d-flex">
              {!activeCall ? (
                <>
                  <button className="btn btn-outline-secondary me-2" onClick={() => startCall("audio")}>
                    <FaPhoneAlt />
                  </button>
                  <button className="btn btn-outline-secondary" onClick={() => startCall("video")}>
                    <FaVideo />
                  </button>
                </>
              ) : (
                <button className="btn btn-danger" onClick={() => setActiveCall(false)}>
                  <FaPhoneSlash /> End Call
                </button>
              )}
            </div>
          </div>

          {/* ✅ Incoming Call UI (Now using acceptCall & rejectCall) */}
          {incomingCall && (
            <div className="incoming-call-overlay">
              <div className="incoming-call-box">
                <h4>Incoming Call</h4>
                <button className="btn btn-success me-2" onClick={acceptCall}>Accept</button>
                <button className="btn btn-danger" onClick={rejectCall}>Reject</button>
              </div>
            </div>
          )}

          {/* ✅ Chat Messages Body */}
          <div className="chat-body flex-grow-1 overflow-auto p-3">
            {messages.map((msg, index) => (
              <div key={index} className={`d-flex ${msg?.sender === "You" ? "justify-content-end" : "justify-content-start"}`}>
                <div className={`p-2 rounded-3 ${msg?.sender === "You" ? "bg-primary text-white" : "bg-secondary text-white"}`}>
                  {msg?.text}
                </div>
              </div>
            ))}
          </div>

          {/* ✅ Chat Input + Send Button */}
          <div className="chat-footer d-flex p-2 border-top">
            <input type="text" className="form-control" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type a message..."/>
            <button className="btn btn-primary ms-2" onClick={sendMessage}>
              <FaPaperPlane />
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default ChatWindow;