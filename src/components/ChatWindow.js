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
    
    // Join room based on both user IDs to ensure both users join the same room
    // Sort IDs to ensure the same room name regardless of who initiates
    const userIds = [userId, friendId].filter(id => id).sort();
    const directRoom = userIds.length === 2 ? `chat-${userIds[0]}-${userIds[1]}` : null;
    
    if (directRoom) {
      console.log("Joining chat room:", directRoom);
      socket.current.emit("joinChat", { room: directRoom });
    }
    
    // Also join a user-specific room to receive messages when this user is the target
    socket.current.emit("joinChat", { room: `user-${userId}` });
    
    // Listen for Incoming Calls
    socket.current.on("incomingCall", ({ callerId }) => {
      setIncomingCall({ callerId });
    });

    // Listen for Incoming Messages
    socket.current.on("receiveMessage", (data) => {
      console.log("Received message via socket:", data);
      // Extract data using the correct field names
      const { senderId, receiverId, content, text, timestamp, createdAt } = data;
      const messageContent = content || text; // Support both formats
      
      // Accept messages meant for this user (either as sender or receiver)
      if (receiverId === userId || senderId === userId) {
        setMessages(prevMessages => {
          // Create message with timestamp from server if available
          const newMessage = { 
            senderId, 
            receiverId, 
            text: messageContent, // Store as text for UI consistency
            timestamp: timestamp || createdAt || new Date().toISOString() // Use source timestamp if available
          };
          
          // Prevent duplicate messages by checking content
          const messageExists = prevMessages.some(
            msg => (msg.text === messageContent || msg.content === messageContent) && 
                  msg.senderId === senderId && 
                  msg.receiverId === receiverId
          );
          
          if (messageExists) return prevMessages;
          return [...prevMessages, newMessage];
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
        
        // Improved error handling
        if (!response) {
          console.error("⭐️ No response received from getChats API");
          return;
        }

        if (response.data && Array.isArray(response.data)) {
          // Handle case where data is directly the array
          console.log("⭐️ API returned direct array format");
          const formattedMessages = response.data.map(msg => ({
            id: msg.id,
            senderId: msg.senderId,
            receiverId: msg.receiverId,
            text: msg.content || msg.text || msg.message || "",
            timestamp: msg.createdAt || msg.timestamp || new Date().toISOString()
          }));
          console.log("⭐️ Formatted messages:", formattedMessages);
          setMessages(formattedMessages);
        } 
        else if (response.status === 200 && response?.data?.data && Array.isArray(response.data.data)) {
          // Handle nested data format
          console.log("⭐️ API returned nested data format");
          const formattedMessages = response.data.data.map(msg => ({
            id: msg.id,
            senderId: msg.senderId,
            receiverId: msg.receiverId,
            text: msg.content || msg.text || "", // API sends 'content' but component expects 'text'
            timestamp: msg.createdAt || msg.timestamp || new Date().toISOString()
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
        // Get timestamp from any available source
        const timestamp = msg.createdAt || msg.timestamp || 
                         (msg.id && new Date(Number(msg.id)).toISOString()) || 
                         new Date().toISOString();
                         
        // Ensure the basic properties exist
        return {
          id: msg.id || Date.now() + Math.random(),
          senderId: msg.senderId || msg.sender_id || 0,
          receiverId: msg.receiverId || msg.receiver_id || 0,
          text: msg.text || msg.content || msg.message || "",
          timestamp: timestamp,
        };
      }).filter(msg => {
        // Filter out invalid messages
        return msg.text && (msg.senderId || msg.receiverId);
      });
      
      // Only update if there's a difference (avoiding endless loop)
      const cleaned = JSON.stringify(cleanedMessages);
      const original = JSON.stringify(messages);
      if (cleaned !== original) {
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
        console.log("Message sent response:", response?.data);
        
        // Get the proper timestamp from the response
        let messageTimestamp = new Date().toISOString();
        
        // Check different possible response formats for timestamp
        if (response?.data?.data?.createdAt) {
          messageTimestamp = response.data.data.createdAt;
        } else if (response?.data?.createdAt) {
          messageTimestamp = response.data.createdAt;
        } else if (response?.data?.data?.timestamp) {
          messageTimestamp = response.data.data.timestamp;
        } else if (response?.data?.timestamp) {
          messageTimestamp = response.data.timestamp;
        }
        
        console.log("Using timestamp for new message:", messageTimestamp);
        
        // Create message with proper timestamp
        const newMessage = {
          senderId: userId,
          receiverId: friendId,
          text: input,
          timestamp: messageTimestamp
        };

        // Update UI immediately
        setMessages(prevMessages => [...prevMessages, newMessage]);

        // Create a room name based on sorted user IDs for consistency
        const userIds = [userId, friendId].sort();
        const directRoom = `chat-${userIds[0]}-${userIds[1]}`;

        // Emit message to socket server
        if (socket.current) {
          socket.current.emit("sendMessage", {
            senderId: userId,
            receiverId: friendId,
            content: input,
            room: directRoom,
            timestamp: messageTimestamp
          });
        }

        setInput("");
      } catch (error) {
        console.error("Error sending message:", error);
      }
    }
  };

  // Function to format timestamp like WhatsApp/Teams
  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    
    try {
      const date = new Date(timestamp);
      
      // Check if date is valid
      if (isNaN(date.getTime())) {
        console.log("Invalid date from timestamp:", timestamp);
        return '';
      }
      
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      
      const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      // Check if the message is from today
      if (date.toDateString() === now.toDateString()) {
        return `Today ${time}`;
      }
      // Check if the message is from yesterday
      else if (date.toDateString() === yesterday.toDateString()) {
        return `Yesterday ${time}`;
      }
      // Check if within the last week
      else {
        const dayDiff = Math.round((now - date) / (1000 * 60 * 60 * 24));
        
        if (dayDiff < 7) {
          // Return day name (e.g., "Friday")
          return `${date.toLocaleDateString([], { weekday: 'long' })} ${time}`;
        } else {
          // Return full date (e.g., "29 March 13:56")
          return `${date.getDate()} ${date.toLocaleDateString([], { month: 'long' })} ${time}`;
        }
      }
    } catch (e) {
      console.error("Error formatting date:", e, "Timestamp was:", timestamp);
      return '';
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
              (() => {
                // Group messages by date
                const messagesByDate = {};
                const now = new Date();
                const yesterday = new Date(now);
                yesterday.setDate(yesterday.getDate() - 1);
                
                // Sort messages by date
                const sortedMessages = [...messages].sort((a, b) => {
                  return new Date(a.timestamp || a.createdAt) - new Date(b.timestamp || b.createdAt);
                });
                
                // Group them by date
                sortedMessages.forEach(msg => {
                  const timestamp = msg.timestamp || msg.createdAt;
                  if (!timestamp) return;
                  
                  const date = new Date(timestamp);
                  let dateKey;
                  
                  // Determine the date key
                  if (date.toDateString() === now.toDateString()) {
                    dateKey = "Today";
                  } else if (date.toDateString() === yesterday.toDateString()) {
                    dateKey = "Yesterday";
                  } else {
                    // Format: "Monday", "Tuesday", etc. for last week
                    // Or "29 March" for older dates
                    const dayDiff = Math.round((now - date) / (1000 * 60 * 60 * 24));
                    if (dayDiff < 7) {
                      dateKey = date.toLocaleDateString([], { weekday: 'long' });
                    } else {
                      dateKey = `${date.getDate()} ${date.toLocaleDateString([], { month: 'long' })}`;
                    }
                  }
                  
                  if (!messagesByDate[dateKey]) {
                    messagesByDate[dateKey] = [];
                  }
                  messagesByDate[dateKey].push(msg);
                });
                
                // Render messages grouped by date
                return Object.entries(messagesByDate).map(([dateKey, groupMessages]) => (
                  <div key={dateKey} className="message-group mb-4">
                    {/* Date Header */}
                    <div className="date-separator text-center my-3">
                      <span className="date-label bg-light px-3 py-1 rounded-pill small text-muted">
                        {dateKey}
                      </span>
                    </div>
                    
                    {/* Messages for this date */}
                    {groupMessages.map((msg, index) => {
                      const messageContent = msg.text || msg.content || msg.message || "";
                      const isSentByMe = String(msg.senderId) === String(userId);
                      const timestamp = new Date(msg.timestamp || msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                      
                      return (
                        <div key={index} className={`d-flex mb-2 ${isSentByMe ? "justify-content-end" : "justify-content-start"}`}>
                          <div style={{maxWidth: "70%"}}>
                            <div className={`p-2 rounded-3 ${isSentByMe ? "bg-primary text-white" : "bg-secondary text-white"}`} 
                                 style={{wordBreak: "break-word"}}>
                              {messageContent}
                            </div>
                            <div className="text-muted small mt-1 text-end">
                              {timestamp}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ));
              })()
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