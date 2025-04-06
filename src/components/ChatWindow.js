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

  // Track recently sent messages to avoid duplicates from socket
  const sentMessagesRef = useRef(new Set());

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
      // This is a real PeerJS call object with an answer method
      setIncomingCall({
        type: 'peerjs',
        callObject: call,
        callerId: null
      });
    });

    return () => {
      peer.current?.destroy();
      socket.current?.disconnect();
    };
  }, [friendSlug, userId, url]);

  // Separate useEffect for socket room management
  useEffect(() => {
    if (!socket.current) return;
    
    // Create exact room name used by backend
    const directRoom = friendId ? `room-${userId}-${friendId}` : null;
    
    if (directRoom) {
      console.log("Joining chat room:", directRoom);
      socket.current.emit("joinChat", { room: directRoom });
      
      // Also join reversed room (in case message is sent to that room instead)
      const reversedRoom = `room-${friendId}-${userId}`;
      socket.current.emit("joinChat", { room: reversedRoom });
    }
    
    // Also join personal room to catch direct messages
    socket.current.emit("joinChat", { room: `${userId}` });
    
    // Listen for Incoming Calls
    socket.current.on("incomingCall", ({ callerId }) => {
      // This is just a notification about an incoming call, not the actual call object
      setIncomingCall({
        type: 'socket',
        callerId: callerId,
        callObject: null
      });
    });
    
    // Listen for Incoming Messages
    socket.current.on("receiveMessage", (data) => {
      console.log("📩 Received message via socket:", data);
      // Extract data using the correct field names from backend
      const { senderId, receiverId, message } = data;
      const messageContent = message; // Backend sends 'message' property
      
      if (!messageContent) {
        console.log("📩 Received empty message, ignoring");
        return;
      }

      // Skip this message if it's from us and we just sent it (to avoid duplicates)
      if (String(senderId) === String(userId) && sentMessagesRef.current.has(messageContent)) {
        console.log("📩 Skipping locally sent message received from socket:", messageContent);
        return;
      }
      
      // Accept messages meant for this user (either as sender or receiver)
      if (receiverId === userId || senderId === userId) {
        console.log(`📩 Message is for me! senderId=${senderId}, receiverId=${receiverId}, userId=${userId}`);
        setMessages(prevMessages => {
          // Create message with timestamp
          const newMessage = { 
            senderId, 
            receiverId, 
            text: messageContent, // Store as text for UI consistency
            timestamp: new Date().toISOString() // Use current time as socket doesn't provide timestamp
          };
          
          // Prevent duplicate messages by checking content and IDs
          const messageExists = prevMessages.some(
            msg => (msg.text === messageContent) && 
                  String(msg.senderId) === String(senderId) && 
                  String(msg.receiverId) === String(receiverId)
          );
          
          if (messageExists) {
            console.log("📩 Message already exists, not adding duplicate");
            return prevMessages;
          }
          
          console.log("📩 Adding new message to state:", newMessage);
          return [...prevMessages, newMessage];
        });
      } else {
        console.log(`📩 Message is not for me. senderId=${senderId}, receiverId=${receiverId}, userId=${userId}`);
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
        
        if (incomingCall.type === 'peerjs' && incomingCall.callObject) {
          // If we have a PeerJS call object, use its answer method
          incomingCall.callObject.answer(userStream);
          incomingCall.callObject.on("stream", (remoteUserStream) => {
            if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteUserStream;
          });
        } else {
          // If we only have callerId from socket notification, we need to wait
          // for the actual PeerJS call to arrive
          console.log("Accepting call from socket notification, waiting for PeerJS call...");
        }

        // Notify the caller that we've accepted the call
        socket.current.emit("acceptCall", { 
          callerId: incomingCall.callerId || (incomingCall.type === 'peerjs' ? userId : null), 
          friendSlug 
        });
        
        setIncomingCall(null);
      })
      .catch(error => alert("Error accessing media devices: " + error.message));
  }, [incomingCall, friendSlug, userId]);

  const rejectCall = useCallback(() => {
    if (!incomingCall) return;
    
    // If we have a PeerJS call object, close it
    if (incomingCall.type === 'peerjs' && incomingCall.callObject) {
      incomingCall.callObject.close();
    }
    
    // Notify the caller that we've rejected the call
    socket.current.emit("rejectCall", { 
      callerId: incomingCall.callerId || (incomingCall.type === 'peerjs' ? userId : null), 
      friendSlug 
    });
    
    setIncomingCall(null);
  }, [incomingCall, friendSlug, userId]);

  // Send Chat Message
  const sendMessage = async () => {
    if (input.trim() !== "") {
      try {
        // Generate a temporary ID to track this message
        const tempId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        
        // Add to tracking set to prevent duplicate from socket
        sentMessagesRef.current.add(input.trim());
        
        // First save message to database
        const response = await sendMessages(friendSlug, input);
        console.log("📤 Message sent response:", response?.data);
        
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
        
        console.log("📤 Using timestamp for new message:", messageTimestamp);
        
        // Create message with proper timestamp
        const newMessage = {
          id: tempId, // Add unique ID
          senderId: userId,
          receiverId: friendId,
          text: input,
          timestamp: messageTimestamp,
          _locally_added: true // Mark as locally added
        };

        // Update UI immediately (for sender)
        setMessages(prevMessages => [...prevMessages, newMessage]);

        // Send to direct rooms to ensure delivery
        if (socket.current) {
          // Create the exact same room name as backend uses
          const roomName = `room-${userId}-${friendId}`;
          
          console.log(`📤 Emitting message to room: ${roomName}`);
          
          // Send to the room with the exact format backend expects
          socket.current.emit("sendMessage", {
            senderId: userId,
            receiverId: friendId,
            message: input, // Backend expects 'message' not 'content' or 'text'
            room: roomName
          });
          
          console.log("📤 Message emitted to room");
        }

        setInput("");
        
        // Clean up sent message tracking after 10 seconds
        setTimeout(() => {
          sentMessagesRef.current.delete(input.trim());
        }, 10000);
        
      } catch (error) {
        console.error("Error sending message:", error);
      }
    }
  };

  // Function to format timestamp like WhatsApp/Teams
  // eslint-disable-next-line no-unused-vars
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