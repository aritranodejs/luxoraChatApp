import React, { useState, useEffect, useRef, useCallback } from "react";
import { FaPhoneAlt, FaVideo, FaPhoneSlash, FaPaperPlane } from "react-icons/fa";
import Peer from "peerjs";
import { io } from "socket.io-client";
import { updatePeerId, getFriend } from "../services/friendService";
import { getUser } from "../utils/authHelper";
import { getChats, sendMessages } from "../services/chatService"; // ✅ Import chat API functions
import "../styles/ChatWindow.css"; // Import the CSS file

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
    // Initialize socket with explicit debug options
    socket.current = io(url, {
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000
    });
    
    // Socket connection event handlers
    socket.current.on('connect', () => {
      console.log('Socket connected successfully with ID:', socket.current.id);
    });
    
    socket.current.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });
    
    socket.current.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
    });
    
    // Initialize PeerJS
    peer.current = new Peer();

    peer.current.on("open", async (id) => {
      const response = await updatePeerId(friendSlug, id);
      setFriendId(response?.data?.id);
      socket.current.emit("userId", userId);
    });

    // Handle incoming calls from PeerJS
    peer.current.on("call", (call) => {
      // This is a real PeerJS call object with an answer method
      const callType = call.metadata?.callType || "video";
      setIncomingCall({
        type: 'peerjs',
        callObject: call,
        callerId: null,
        callType: callType
      });
    });

    return () => {
      peer.current?.destroy();
      socket.current?.disconnect();
    };
  }, [friendSlug, userId, url]);

  // Define endCall function before it's used in the above useEffect
  const endCall = useCallback(() => {
    // Close media streams
    if (mediaStream.current) {
      const tracks = mediaStream.current.getTracks();
      tracks.forEach(track => track.stop());
      mediaStream.current = null;
    }
    
    // Close the call
    if (callInstance.current) {
      callInstance.current.close();
      callInstance.current = null;
    }
    
    // Clear video elements
    if (myVideoRef.current) myVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    
    // Notify the other user that we've ended the call
    socket.current.emit("endCall", { 
      friendId,
      callerId: userId
    });
    
    // Reset state
    setActiveCall(false);
  }, [friendId, userId]);

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

    // Custom socket handlers for direct peer connection
    socket.current.on("peerSignal", (data) => {
      console.log("Received peer signal:", data);
      // This will be handled by the VideoCall component
    });
    
    socket.current.on("updatePeerId", (data) => {
      console.log("Received peer ID update:", data);
      if (data.friendId === friendId) {
        setFriendPeerId(data.peerId);
      }
    });

    // Listen for Incoming Calls
    socket.current.on("incomingCall", ({ callerId, callerName, callerPeerId, callType, friendId, friendSlug }) => {
      console.log("Incoming call received from:", callerId, "with type:", callType);
      
      // Check if we're the intended recipient (using id or slug)
      const isForMe = 
        friendId === userId || 
        (friendSlug && friendSlug === window.location.pathname.split('/').pop());
      
      if (isForMe || (!friendId && !friendSlug)) {
        console.log("This incoming call is for me, showing notification");
        
        // This is just a notification about an incoming call, not the actual call object
        setIncomingCall({
          type: 'socket',
          callerId: callerId,
          callerName: callerName,
          callerPeerId: callerPeerId,
          callObject: null,
          callType: callType || 'video' // Use the received call type with fallback
        });
      } else {
        console.log("Incoming call not meant for me, ignoring");
      }
    });
    
    // Listen for Call Accepted (for the caller)
    socket.current.on("callAccepted", ({ accepterId, accepterPeerId }) => {
      console.log("Call accepted by:", accepterId, "with peer ID:", accepterPeerId);
      // We'll handle navigation to call page elsewhere
      
      // Update the accepted call data in session storage
      try {
        const storedCallDataStr = sessionStorage.getItem('callData');
        if (storedCallDataStr) {
          const storedCallData = JSON.parse(storedCallDataStr);
          storedCallData.friendPeerId = accepterPeerId;
          sessionStorage.setItem('callData', JSON.stringify(storedCallData));
        }
      } catch (err) {
        console.error("Error updating call data with accepter peer ID:", err);
      }
    });
    
    // Listen for Call Ended
    socket.current.on("callEnded", () => {
      console.log("Call ended by the other user");
      // If we're in a call, end it
      if (activeCall) {
        endCall();
      }
      // If we have an incoming call, clear it
      if (incomingCall) {
        setIncomingCall(null);
      }
    });

    // Listen for Call Rejected
    socket.current.on("callRejected", () => {
      console.log("Call was rejected by the recipient");
      // Close resources and reset UI
      if (mediaStream.current) {
        mediaStream.current.getTracks().forEach(track => track.stop());
        mediaStream.current = null;
      }
      
      if (callInstance.current) {
        callInstance.current.close();
        callInstance.current = null;
      }
      
      setActiveCall(false);
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

    // Listen for global call announcements - this is the most reliable method
    socket.current.on("globalCallAnnouncement", (data) => {
      console.log("Received global call announcement:", data);
      
      // Check if this call is for us (using either ID or slug for maximum compatibility)
      const isForMe = 
        data.targetId === userId || 
        (data.targetSlug && friendSlug && data.targetSlug === friendSlug);
      
      if (isForMe) {
        console.log("This call is for me! Showing incoming call UI...");
        
        // Show incoming call notification with full data
        setIncomingCall({
          type: 'socket',
          callerId: data.callerId,
          callerName: data.callerName,
          callerPeerId: data.callerPeerId,
          callObject: null,
          callType: data.callType || 'video',
          timestamp: data.timestamp
        });
        
        // Also play a sound if needed
        try {
          const audio = new Audio('/call-ring.mp3');
          audio.play().catch(e => console.log("Could not play notification sound:", e));
        } catch (e) {
          console.log("Error playing notification sound:", e);
        }
      } else {
        console.log("This call is not for me, ignoring.", 
          `Expected ID: ${userId} or slug: ${friendSlug}, got targetId: ${data.targetId}, targetSlug: ${data.targetSlug}`);
      }
    });

    // Listen for broadcast calls (backup method)
    socket.current.on("broadcastCall", (data) => {
      console.log("Received broadcast call:", data);
      
      // Only handle if we're the intended recipient by ID or slug
      const isForMe = 
        data.friendId === userId || 
        (data.friendSlug && friendSlug && 
         (data.friendSlug === friendSlug || friendSlug.includes(data.friendSlug) || data.friendSlug.includes(friendSlug)));
      
      if (isForMe) {
        console.log("I'm the intended recipient of this broadcast call!");
        
        // If we don't already have an incoming call, set it
        if (!incomingCall) {
          setIncomingCall({
            type: 'socket',
            callerId: data.callerId,
            callerName: data.callerName,
            callerPeerId: data.callerPeerId,
            callObject: null,
            callType: data.callType || 'video'
          });
        }
      } else {
        console.log("Broadcast call not for me, ignoring.", 
          `Expected ID: ${userId} or slug: ${friendSlug}, got friendId: ${data.friendId}, friendSlug: ${data.friendSlug}`);
      }
    });

    return () => {
      if (directRoom) {
        socket.current.emit("leaveChat", { room: directRoom });
      }
      socket.current.off("receiveMessage");
      socket.current.off("incomingCall");
      socket.current.off("callEnded");
      socket.current.off("callRejected");
      socket.current.off("broadcastCall");
      socket.current.off("peerSignal");
      socket.current.off("updatePeerId");
      socket.current.off("globalCallAnnouncement");
    };
  }, [friendId, userId, endCall, activeCall, incomingCall, friendSlug]);

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

  const startCall = async (friendId, friendPeerId, friendName, callType = 'video') => {
    console.log(`Starting ${callType} call with ${friendName} (ID: ${friendId}, Slug: ${friendSlug})`);
    
    if (!socket.current) {
      alert("Cannot start call: socket connection not available");
      return;
    }
    
    try {
      // Set active call state
      setActiveCall({
        isActive: true,
        friendId: friendId,
        friendSlug: friendSlug,
        friendName: friendName,
        type: callType
      });
      
      // Request media access
      const mediaConstraints = {
        audio: true,
        video: callType === 'video'
      };
      
      // Get local media stream but we don't need to store it here
      await navigator.mediaDevices.getUserMedia(mediaConstraints);
      console.log(`Got local media stream for ${callType} call`);
      
      // IMPORTANT: Notify the friend about incoming call via socket
      if (socket.current) {
        console.log(`Emitting call notification to ${friendName} (ID: ${friendId}, Slug: ${friendSlug})`);
        
        // SOLUTION 1: Emit to ALL online users with filtering - most reliable method
        socket.current.emit("globalCallAnnouncement", {
          callerId: userId,
          callerName: getUser()?.name || 'User',
          callerPeerId: peer.current.id,
          targetId: friendId,
          targetSlug: friendSlug,
          callType: callType,
          timestamp: Date.now() // Add timestamp to identify this specific call
        });
        
        // SOLUTION 2: Emit directly to friend's personal room
        socket.current.emit("incomingCall", {
          callerId: userId,
          callerName: getUser()?.name || 'User',
          callerPeerId: peer.current.id,
          friendId: friendId,
          friendSlug: friendSlug,
          callType: callType,
          targetRoom: `${friendId}`,
          targetUserId: friendId
        });
        
        // SOLUTION 3: Emit to the shared room
        const directRoom = `room-${userId}-${friendId}`;
        socket.current.emit("incomingCall", {
          callerId: userId,
          callerName: getUser()?.name || 'User',
          callerPeerId: peer.current.id,
          friendId: friendId, 
          friendSlug: friendSlug,
          callType: callType,
          targetRoom: directRoom
        });
        
        // SOLUTION 4: Use dedicated broadcast method
        socket.current.emit("broadcastCall", {
          callerId: userId,
          callerName: getUser()?.name || 'User',
          callerPeerId: peer.current.id,
          friendId: friendId,
          friendSlug: friendSlug,
          callType: callType
        });
        
        // Let's also emit a specific event for direct peer-to-peer communication
        if (peer.current && peer.current.id) {
          socket.current.emit("peerSignal", {
            signal: { type: 'call-intent', callType },
            senderPeerId: peer.current.id,
            targetUserId: friendId,
            targetSlug: friendSlug
          });
        }
      } else {
        console.error("Socket not available, cannot notify friend about call");
        throw new Error("Socket connection not available");
      }
      
      // Save call data in sessionStorage for the video call page
      const callData = {
        friendId: friendId,
        friendSlug: friendSlug,
        friendName: friendName,
        friendPeerId: friendPeerId,
        callType: callType,
        isInitiator: true,
        callerPeerId: peer.current?.id
      };
      
      // Store call data in sessionStorage
      sessionStorage.setItem('callData', JSON.stringify(callData));
      
      // Navigate to video call page - IMPORTANT: Use friendSlug not friendId
      window.location.href = `/call/${friendSlug}?callType=${callType}&friendName=${encodeURIComponent(friendName)}`;
    } catch (err) {
      console.error('Error starting call:', err);
      alert(`Could not start call: ${err.message}`);
      setActiveCall({ isActive: false });
    }
  };

  const acceptCall = async () => {
    console.log("Accepting call from:", incomingCall);
    
    if (!incomingCall) {
      console.error("No incoming call to accept");
      return;
    }
    
    try {
      // Request media access
      const mediaConstraints = {
        audio: true,
        video: incomingCall.callType === 'video'
      };
      
      // Get local media stream but we don't need to store it here
      await navigator.mediaDevices.getUserMedia(mediaConstraints);
      console.log(`Got local media stream for ${incomingCall.callType} call`);
      
      // Get our peer ID to share with the caller
      const myPeerId = peer.current?.id;
      
      // Get the caller's slug - either from incomingCall or the current route
      const callerSlug = incomingCall.callerSlug || window.location.pathname.split('/').pop();
      
      // Save call data in sessionStorage
      const callData = {
        friendId: incomingCall.callerId,
        friendSlug: callerSlug,
        friendName: incomingCall.callerName || friendName, // Use friendName as fallback
        friendPeerId: incomingCall.callerPeerId,
        callType: incomingCall.callType,
        isInitiator: false,
        callerPeerId: incomingCall.callerPeerId,
        accepterPeerId: myPeerId
      };
      
      console.log("Call data for acceptance:", callData);
      
      // Store call data
      sessionStorage.setItem('callData', JSON.stringify(callData));
      
      // Notify caller that call was accepted
      if (socket.current) {
        console.log("Emitting callAccepted event to caller:", incomingCall.callerId);
        socket.current.emit('callAccepted', {
          callerId: incomingCall.callerId,
          accepterId: userId,
          accepterPeerId: myPeerId,
          accepterSlug: friendSlug // Send our slug back
        });
        
        // Also send direct peer signal if we have peer IDs
        if (myPeerId && incomingCall.callerPeerId) {
          socket.current.emit('peerSignal', {
            signal: { type: 'accept-call', callType: incomingCall.callType },
            senderPeerId: myPeerId,
            targetPeerId: incomingCall.callerPeerId
          });
        }
      } else {
        console.error("Socket not available, cannot notify caller");
      }
      
      // Handle PeerJS call if present
      if (incomingCall.type === 'peerjs' && incomingCall.callObject) {
        console.log("Found PeerJS call object, will answer in VideoCall component");
        // The VideoCall component will handle answering this call
      }
      
      // Navigate to video call page using the caller's slug or ID as fallback
      const callDestination = callerSlug || incomingCall.callerId;
      window.location.href = `/call/${callDestination}?callType=${incomingCall.callType}&friendName=${encodeURIComponent(callData.friendName)}`;
    } catch (err) {
      console.error('Error accepting call:', err);
      alert(`Could not accept call: ${err.message}`);
      setIncomingCall(null);
    }
  };

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
                  <button className="btn btn-outline-secondary me-2" onClick={() => startCall(friendId, friendPeerId, friendName, "audio")} title="Start audio call">
                    <FaPhoneAlt /> <span className="d-none d-md-inline"></span>
                  </button>
                  <button className="btn btn-outline-secondary" onClick={() => startCall(friendId, friendPeerId, friendName, "video")} title="Start video call">
                    <FaVideo /> <span className="d-none d-md-inline"></span>
                  </button>
                </>
              ) : (
                <button className="btn btn-danger" onClick={endCall}>
                  <FaPhoneSlash /> End Call
                </button>
              )}
            </div>
          </div>

          {/* Incoming Call UI */}
          {incomingCall && (
            <div className="incoming-call-overlay">
              <div className="incoming-call-box">
                <div className={`pulse-icon mb-3 ${incomingCall.callType === "audio" ? "bg-primary" : "bg-success"} text-white rounded-circle d-flex justify-content-center align-items-center mx-auto`}
                     style={{ width: "80px", height: "80px" }}>
                  {incomingCall.callType === "audio" ? <FaPhoneAlt size={32} /> : <FaVideo size={32} />}
                </div>
                <h4 className="mb-3">Incoming {incomingCall.callType === "audio" ? "Audio" : "Video"} Call</h4>
                <p className="mb-4">{friendName || "Your friend"} is calling...</p>
                <div className="d-flex justify-content-center">
                  <button className="btn call-button call-button-accept me-3" onClick={acceptCall}>
                    <FaPhoneAlt /> Accept
                  </button>
                  <button className="btn call-button call-button-reject" onClick={rejectCall}>
                    <FaPhoneSlash /> Decline
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Chat Messages Body */}
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

          {/* Chat Input + Send Button */}
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