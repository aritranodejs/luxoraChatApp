import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
  const roomName = useMemo(() => 
    userId && friendId ? `room-${userId}-${friendId}` : null
  , [userId, friendId]);

  useEffect(() => {
    socket.current = io(url);
    peer.current = new Peer();
    
    peer.current.on("open", async (id) => {
      const response = await updatePeerId(friendSlug, id);
      setFriendId(response?.data?.id);
      socket.current.emit("userId", userId);
    });

    // Handle incoming calls from PeerJS
    peer.current.on("call", (call) => {
      setIncomingCall(call);
    });

    return () => {
      peer.current?.destroy();
      socket.current?.disconnect();
    };
  }, [friendSlug, userId, url]);

  // Separate useEffect for socket room management
  useEffect(() => {
    if (!socket.current) return;
    
    // Create a direct room between the two users regardless of roomName value
    const directRoom = friendId ? `room-${userId}-${friendId}` : null;
    
    if (directRoom) {
      console.log("Joining chat room:", directRoom);
      socket.current.emit("joinChat", { room: directRoom });
    }
    
    // Also join a room with the user's own ID to receive messages when offline
    socket.current.emit("joinChat", { room: `user-${userId}` });
    
    // Listen for Incoming Calls
    socket.current.on("incomingCall", ({ callerId }) => {
      setIncomingCall({ callerId });
    });

    // Listen for Incoming Messages
    socket.current.on("receiveMessage", (data) => {
      console.log("Received message via socket:", data);
      // Extract data using the correct field names
      const { senderId, receiverId, content, text } = data;
      const messageContent = content || text; // Support both formats
      
      // Accept messages meant for this user
      if (receiverId === userId || senderId === userId) {
        setMessages(prevMessages => {
          // Prevent duplicate messages
          const messageExists = prevMessages.some(
            msg => (msg.text === messageContent || msg.content === messageContent) && 
                  msg.senderId === senderId && 
                  msg.receiverId === receiverId
          );
          if (messageExists) return prevMessages;
          return [...prevMessages, { 
            senderId, 
            receiverId, 
            text: messageContent // Store as text for UI consistency 
          }];
        });
      }
    });

    return () => {
      if (directRoom) {
        socket.current.emit("leaveChat", { room: directRoom });
      }
      socket.current.off("receiveMessage");
      socket.current.off("incomingCall");
    };
  }, [friendId, userId]);

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
        console.log("⭐️ Starting fetchChatHistory for friend:", friendSlug);
        const response = await getChats(friendSlug);

        // Log FULL response to understand its structure
        console.log("⭐️ Raw API response:", response);
        console.log("⭐️ response.data:", response?.data);
        console.log("⭐️ response.data.data:", response?.data?.data);
        
        // Improved error handling
        if (!response) {
          console.error("⭐️ No response received from getChats API");
          return;
        }

        if (response.data && Array.isArray(response.data)) {
          // Handle case where data is directly the array
          console.log("⭐️ API returned direct array format");
          const formattedMessages = response.data.map(msg => ({
            senderId: msg.senderId,
            receiverId: msg.receiverId,
            text: msg.content || msg.text || msg.message || "",
            id: msg.id
          }));
          console.log("⭐️ Formatted messages:", formattedMessages);
          setMessages(formattedMessages);
        } 
        else if (response.status === 200 && response?.data?.data && Array.isArray(response.data.data)) {
          // Handle nested data format
          console.log("⭐️ API returned nested data format");
          const formattedMessages = response.data.data.map(msg => ({
            senderId: msg.senderId,
            receiverId: msg.receiverId,
            text: msg.content || msg.text || "", // API sends 'content' but component expects 'text'
            id: msg.id
          }));
          console.log("⭐️ Formatted messages:", formattedMessages);
          setMessages(formattedMessages);
        }
        else {
          console.error("⭐️ Unexpected API response format:", response);
        }

      } catch (error) {
        console.error("⭐️ Error fetching chat history:", error);
      }
    };

    if (friendSlug) fetchChatHistory();
  }, [friendSlug]);

  // Add a useEffect to clean up and standardize message format
  useEffect(() => {
    if (messages && Array.isArray(messages)) {
      // This is a safety check to ensure all messages have the right format
      const cleanedMessages = messages.map(msg => {
        // Ensure the basic properties exist
        return {
          id: msg.id || Date.now() + Math.random(),
          senderId: msg.senderId || msg.sender_id || 0,
          receiverId: msg.receiverId || msg.receiver_id || 0,
          text: msg.text || msg.content || msg.message || "",
        };
      }).filter(msg => {
        // Filter out invalid messages
        return msg.text && (msg.senderId || msg.receiverId);
      });
      
      if (JSON.stringify(cleanedMessages) !== JSON.stringify(messages)) {
        console.log("⭐️ Cleaned up messages format for consistency:", cleanedMessages);
        setMessages(cleanedMessages);
      }
    }
  }, [messages]);

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
        // First save message to database
        const response = await sendMessages(friendSlug, input);
        console.log("Message sent response:", response);
        
        const newMessage = {
          senderId: userId,
          receiverId: friendId,
          text: input // Use 'text' for local UI consistency
        };

        // Update UI immediately
        setMessages(prevMessages => [...prevMessages, newMessage]);

        // Emit message to socket server
        if (socket.current) {
          console.log("Emitting message:", {
            senderId: userId,
            receiverId: friendId,
            content: input, // Use 'content' to match backend API
            room: roomName
          });
          
          // Send to general socket and specify room
          socket.current.emit("sendMessage", {
            senderId: userId,
            receiverId: friendId,
            content: input, // Use 'content' to match backend API
            room: roomName || `room-${userId}-${friendId}` // Fallback if roomName not set
          });
        }

        setInput("");
      } catch (error) {
        console.error("Error sending message:", error);
      }
    }
  };

  // Add debugging right before rendering to see what messages are being mapped
  console.log("⭐️ RENDERING COMPONENT, messages state:", messages);

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
            {Array.isArray(messages) && messages.length > 0 ? (
              messages.map((msg, index) => {
                console.log("⭐️ Rendering message:", msg, "User ID:", userId);
                const messageContent = msg.text || msg.content || msg.message || "";
                const isSentByMe = String(msg.senderId) === String(userId);
                
                return (
                  <div key={index} className={`d-flex mb-2 ${isSentByMe ? "justify-content-end" : "justify-content-start"}`}>
                    <div className={`p-2 rounded-3 ${isSentByMe ? "bg-primary text-white" : "bg-secondary text-white"}`} 
                         style={{maxWidth: "70%", wordBreak: "break-word"}}>
                      {messageContent}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center text-muted mt-4">
                No messages yet. Send a message to start the conversation!
                {!Array.isArray(messages) && <div className="text-danger">Error: messages is not an array</div>}
              </div>
            )}
          </div>

          {/* ✅ Chat Input + Send Button */}
          <div className="chat-footer d-flex p-2 border-top">
            <input 
              type="text" 
              className="form-control" 
              value={input} 
              onChange={(e) => setInput(e.target.value)} 
              placeholder="Type a message..."
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
            />
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