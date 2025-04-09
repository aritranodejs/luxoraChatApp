import React, { useState, useEffect, useRef, useCallback } from "react";
import { FaPhoneAlt, FaVideo, FaPhoneSlash, FaPaperPlane, FaSmile } from "react-icons/fa";
import Peer from "peerjs";
import { io } from "socket.io-client";
import { updatePeerId, getFriend } from "../services/friendService";
import { getUser } from "../utils/authHelper";
import { getChats, sendMessages } from "../services/chatService"; // ✅ Import chat API functions
import "../styles/ChatWindow.css"; // Import the CSS file
import * as callHelper from "../utils/callHelper"; // Import call helper utilities

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
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

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

  const messageContainerRef = useRef(null);

  // Add this new function to scroll to bottom
  const scrollToBottom = () => {
    if (messageContainerRef.current) {
      const scrollHeight = messageContainerRef.current.scrollHeight;
      const height = messageContainerRef.current.clientHeight;
      const maxScrollTop = scrollHeight - height;
      messageContainerRef.current.scrollTop = maxScrollTop > 0 ? maxScrollTop : 0;
    }
  };

  // Update useEffect for messages
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Update useEffect for chat history
  useEffect(() => {
    const fetchChatHistory = async () => {
      try {
        console.log("⭐️ Starting fetchChatHistory for friend:", friendSlug);
        const response = await getChats(friendSlug);

        if (response?.data && Array.isArray(response.data)) {
          const formattedMessages = response.data.map(msg => ({
            id: msg.id,
            senderId: msg.senderId,
            receiverId: msg.receiverId,
            text: msg.content || msg.text || msg.message || "",
            timestamp: msg.createdAt || msg.timestamp || new Date().toISOString()
          }));
          setMessages(formattedMessages);
          // Scroll to bottom after setting messages
          setTimeout(scrollToBottom, 100);
        } 
        else if (response?.status === 200 && response?.data?.data && Array.isArray(response.data.data)) {
          const formattedMessages = response.data.data.map(msg => ({
            id: msg.id,
            senderId: msg.senderId,
            receiverId: msg.receiverId,
            text: msg.content || msg.text || "",
            timestamp: msg.createdAt || msg.timestamp || new Date().toISOString()
          }));
          setMessages(formattedMessages);
          // Scroll to bottom after setting messages
          setTimeout(scrollToBottom, 100);
        }

      } catch (error) {
        console.error("⭐️ Error fetching chat history:", error);
      }
    };

    if (friendSlug) fetchChatHistory();
  }, [friendSlug]);

  // Handler for emoji selection
  const onEmojiClick = (emojiData) => {
    const emoji = emojiData.emoji;
    const inputElement = document.querySelector('.chat-footer input');
    
    // For flag emojis, ensure we're using the actual Unicode characters
    let emojiToInsert = emoji;
    
    // If we have access to the input element
    if (inputElement) {
      const start = inputElement.selectionStart;
      const end = inputElement.selectionEnd;
      
      // Insert emoji at cursor position
      const newValue = input.substring(0, start) + emojiToInsert + input.substring(end);
      setInput(newValue);
      
      // Set cursor position after emoji
      setTimeout(() => {
        inputElement.selectionStart = start + emojiToInsert.length;
        inputElement.selectionEnd = start + emojiToInsert.length;
        inputElement.focus();
      }, 10);
    } else {
      // Fallback to appending at the end
      setInput(prev => prev + emojiToInsert);
    }
    
    // Keep emoji picker open for multiple emoji selection
    // setShowEmojiPicker(false);
  };

  // Close emoji picker when clicking outside
  const emojiPickerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target)) {
        setShowEmojiPicker(false);
      }
    }
    
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    // Initialize socket with explicit debug options
    socket.current = io(url, {
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      transports: ['websocket', 'polling'] // Try websocket first, fall back to polling
    });
    
    // Make socket available globally for other components
    window.socket = socket.current;
    
    // Socket connection event handlers
    socket.current.on('connect', () => {
      console.log('Socket connected successfully with ID:', socket.current.id);
      
      // Re-emit userId on reconnect to ensure server knows who we are
      if (userId) {
        socket.current.emit("userId", userId);
        console.log("Re-emitted userId on socket connect:", userId);
      }
    });
    
    socket.current.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });
    
    socket.current.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      
      // Attempt to reconnect immediately for crucial signaling
      if (reason === 'io server disconnect' || reason === 'transport close') {
        console.log('Attempting manual reconnection...');
        socket.current.connect();
      }
    });
    
    // Initialize PeerJS with more reliable options
    peer.current = new Peer({
      debug: 3, // Enable debugging
      config: {
        'iceServers': [
          // Multiple STUN servers
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          // Free TURN servers
          {
            urls: [
              'turn:openrelay.metered.ca:80',
              'turn:openrelay.metered.ca:443',
              'turn:openrelay.metered.ca:443?transport=tcp'
            ],
            username: 'openrelayproject',
            credential: 'openrelayproject'
          }
        ]
      }
    });
    
    // Debug PeerJS events
    peer.current.on('open', async (id) => {
      console.log('PeerJS successfully connected with ID:', id);
      const response = await updatePeerId(friendSlug, id);
      setFriendId(response?.data?.id);
      
      // Send our userId to the socket server
      socket.current.emit("userId", userId);
      
      // Announce that I'm available to receive calls
      socket.current.emit("userAvailable", {
        userId,
        friendSlug,
        peerId: id,
        currentChat: window.location.pathname
      });
      
      console.log(`Announced availability with peer ID: ${id}`);
      
      // Send a ping every 30 seconds to keep the socket alive
      const keepAliveInterval = setInterval(() => {
        if (socket.current && socket.current.connected) {
          socket.current.emit("ping", { userId, timestamp: Date.now() });
        }
      }, 30000);
      
      // Clean up interval on component unmount
      return () => clearInterval(keepAliveInterval);
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
      
      // Skip if this is my own call (I'm the caller)
      if (callerId === userId) {
        console.log("This is my own call, ignoring");
        return;
      }
      
      // Check if we're the intended recipient
      const isForMe = 
        friendId === userId || 
        (friendSlug && friendSlug === window.location.pathname.split('/').pop());
      
      if (isForMe || (!friendId && !friendSlug)) {
        console.log("This incoming call is for me, showing notification");
        
        // Save to localStorage for reliability
        callHelper.saveIncomingCall({
          callerId, 
          callerName, 
          callerPeerId, 
          callType: callType || 'video',
          timestamp: Date.now()
        });
        
        // Show notification
        setIncomingCall({
          type: 'socket',
          callerId: callerId,
          callerName: callerName,
          callerPeerId: callerPeerId,
          callObject: null,
          callType: callType || 'video'
        });
        
        // Broadcast to other tabs
        callHelper.broadcastIncomingCall({
          callerId, 
          callerName, 
          callerPeerId, 
          callType: callType || 'video'
        });
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
      const messageContent = message || data.message || data.content || data.text || ""; // Be flexible with field names
      
      if (!messageContent) {
        console.log("📩 Received empty message, ignoring");
        return;
      }

      // Skip this message if it's from us and we just sent it (to avoid duplicates)
      // IMPORTANT: We need to be careful not to filter out legitimate messages
      if (String(senderId) === String(userId) && sentMessagesRef.current.has(messageContent)) {
        console.log("📩 Skipping locally sent message received from socket:", messageContent);
        return;
      }
      
      // Always update messages if the message is related to the current chat
      if ((receiverId === userId && senderId === friendId) || 
          (senderId === userId && receiverId === friendId)) {
        console.log(`📩 Message is relevant to current chat: senderId=${senderId}, receiverId=${receiverId}, userId=${userId}, friendId=${friendId}`);
        
        // Unique ID for the message
        const messageId = data.id || `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        
        setMessages(prevMessages => {
          // Create message with timestamp
          const newMessage = { 
            id: messageId,
            senderId, 
            receiverId, 
            text: messageContent, // Store as text for UI consistency
            timestamp: data.timestamp || data.createdAt || new Date().toISOString()
          };
          
          // Check if this exact message already exists to prevent duplicates
          const isDuplicate = prevMessages.some(msg => 
            (msg.id && msg.id === messageId) || // Match by ID if available
            ((msg.text === messageContent) && // Or by content
             String(msg.senderId) === String(senderId) && 
             String(msg.receiverId) === String(receiverId) &&
             // If timestamps are close enough (within 2 seconds), consider it a duplicate
             (msg.timestamp && Math.abs(new Date(msg.timestamp) - new Date(newMessage.timestamp)) < 2000))
          );
          
          if (isDuplicate) {
            console.log("📩 Message already exists, not adding duplicate");
            return prevMessages;
          }
          
          console.log("📩 Adding new message to state:", newMessage);
          return [...prevMessages, newMessage];
        });
      } else {
        console.log(`📩 Message is not for current chat. senderId=${senderId}, receiverId=${receiverId}, userId=${userId}, friendId=${friendId}`);
      }
    });

    // Listen for direct emergency calls - this should work regardless of rooms
    socket.current.on("emergencyDirectCall", (data) => {
      console.log("⚠️ EMERGENCY CALL RECEIVED:", data);
      
      // IMPORTANT: Ignore calls that I initiated myself
      if (data.callerId === userId) {
        console.log("⚠️ This is my own call, ignoring");
        return;
      }
      
      // Determine if this call is for me
      const recipientMatches = [
        { type: "ID Match", value: data.targetId === userId },
        { type: "Slug Exact Match", value: data.targetSlug === friendSlug },
        { type: "Caller ID Reversal", value: data.callerId === friendId }
      ];
      
      console.log("⚠️ EMERGENCY CALL RECIPIENT MATCHING:", recipientMatches);
      
      // Accept the call if ANY matching criteria is true
      const isForMe = recipientMatches.some(match => match.value === true);
      
      if (isForMe) {
        console.log("⚠️ EMERGENCY CALL IS FOR ME - SHOWING NOTIFICATION");
        
        // Save to localStorage for reliability
        callHelper.saveIncomingCall({
          callerId: data.callerId,
          callerName: data.callerName,
          callerPeerId: data.callerPeerId,
          callType: data.callType || 'video',
          timestamp: data.timestamp,
          isEmergency: true
        });
        
        // Show notification
        setIncomingCall({
          type: 'socket',
          callerId: data.callerId,
          callerName: data.callerName,
          callerPeerId: data.callerPeerId,
          callerSlug: data.callerSlug,
          callObject: null,
          callType: data.callType || 'video',
          timestamp: data.timestamp,
          isEmergency: true
        });
        
        // Play sound
        callHelper.playCallSound();
        
        // Broadcast to other tabs
        callHelper.broadcastIncomingCall({
          callerId: data.callerId,
          callerName: data.callerName,
          callerPeerId: data.callerPeerId,
          callType: data.callType || 'video',
          isEmergency: true
        });
      }
    });

    // Listen for global call announcements - this is the most reliable method
    socket.current.on("globalCallAnnouncement", (data) => {
      console.log("Received global call announcement:", data);
      
      // Ignore calls that I initiated
      if (data.callerId === userId) {
        console.log("This is my own call, ignoring");
        return;
      }
      
      // Check if this call is for us
      const isForMe = 
        data.targetId === userId || 
        (data.targetSlug && friendSlug && data.targetSlug === friendSlug);
      
      if (isForMe) {
        console.log("This call is for me! Showing incoming call UI...");
        
        // Save to localStorage for reliability
        callHelper.saveIncomingCall({
          callerId: data.callerId,
          callerName: data.callerName,
          callerPeerId: data.callerPeerId,
          callType: data.callType || 'video',
          timestamp: data.timestamp
        });
        
        // Show notification
        setIncomingCall({
          type: 'socket',
          callerId: data.callerId,
          callerName: data.callerName,
          callerPeerId: data.callerPeerId,
          callObject: null,
          callType: data.callType || 'video',
          timestamp: data.timestamp
        });
        
        // Play sound
        callHelper.playCallSound();
        
        // Broadcast to other tabs
        callHelper.broadcastIncomingCall({
          callerId: data.callerId,
          callerName: data.callerName,
          callerPeerId: data.callerPeerId,
          callType: data.callType || 'video'
        });
      }
    });

    // Listen for broadcast calls (backup method)
    socket.current.on("broadcastCall", (data) => {
      console.log("Received broadcast call:", data);
      
      // Ignore calls that I initiated
      if (data.callerId === userId) {
        console.log("This is my own broadcast call, ignoring");
        return;
      }
      
      // Only handle if we're the intended recipient
      const isForMe = 
        data.friendId === userId || 
        (data.friendSlug && friendSlug && 
         (data.friendSlug === friendSlug || friendSlug.includes(data.friendSlug)));
      
      if (isForMe) {
        console.log("I'm the intended recipient of this broadcast call!");
        
        // Save to localStorage for reliability
        callHelper.saveIncomingCall({
          callerId: data.callerId,
          callerName: data.callerName,
          callerPeerId: data.callerPeerId,
          callType: data.callType || 'video'
        });
        
        // Show notification if we don't already have one
        if (!incomingCall) {
          setIncomingCall({
            type: 'socket',
            callerId: data.callerId,
            callerName: data.callerName,
            callerPeerId: data.callerPeerId,
            callObject: null,
            callType: data.callType || 'video'
          });
          
          // Play sound
          callHelper.playCallSound();
          
          // Broadcast to other tabs
          callHelper.broadcastIncomingCall({
            callerId: data.callerId,
            callerName: data.callerName,
            callerPeerId: data.callerPeerId,
            callType: data.callType || 'video'
          });
        }
      }
    });

    // Also set up a polling mechanism to check for incoming calls
    const pollInterval = setInterval(() => {
      if (socket.current && userId && !incomingCall) {
        console.log("Polling for missed calls...");
        socket.current.emit("checkMissedCalls", {
          userId,
          friendId,
          friendSlug
        });
      }
    }, 5000); // Poll every 5 seconds

    socket.current.on("missedCall", (data) => {
      console.log("Missed call notification received:", data);
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
    });

    // Add socket event listener for online/offline status
    socket.current.on("userStatusChange", (data) => {
      if (data.userId === friendId) {
        setOnlineStatus(data.isOnline);
        
        // Show status change message
        const statusMessage = {
          id: `status-${Date.now()}`,
          type: 'status',
          text: `${friendName} is ${data.isOnline ? 'online' : 'offline'}`,
          timestamp: new Date().toISOString()
        };
        setMessages(prev => [...prev, statusMessage]);
      }
    });

    // Listen for friend's disconnection
    socket.current.on("userDisconnected", (data) => {
      if (data.userId === friendId) {
        setOnlineStatus(false);
        
        // Show disconnection message
        const statusMessage = {
          id: `status-${Date.now()}`,
          type: 'status',
          text: `${friendName} is offline`,
          timestamp: new Date().toISOString()
        };
        setMessages(prev => [...prev, statusMessage]);
      }
    });

    // Listen for friend's reconnection
    socket.current.on("userReconnected", (data) => {
      if (data.userId === friendId) {
        setOnlineStatus(true);
        
        // Show reconnection message
        const statusMessage = {
          id: `status-${Date.now()}`,
          type: 'status',
          text: `${friendName} is online`,
          timestamp: new Date().toISOString()
        };
        setMessages(prev => [...prev, statusMessage]);
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
      socket.current.off("emergencyDirectCall");
      socket.current.off("missedCall");
      socket.current.off("userStatusChange");
      socket.current.off("userDisconnected");
      socket.current.off("userReconnected");
      
      // Clear the polling interval
      clearInterval(pollInterval);
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
      
      // Check if the friendPeerId is available
      if (!friendPeerId) {
        alert(`${friendName} appears to be offline. They will receive your call when they come online.`);
      }
      
      // Request media access
      const mediaConstraints = {
        audio: true,
        video: callType === 'video'
      };
      
      // Get local media stream 
      await navigator.mediaDevices.getUserMedia(mediaConstraints);
      console.log(`Got local media stream for ${callType} call`);
      
      // Prepare call data
      const callData = {
        callerId: userId,
        callerName: getUser()?.name || 'User',
        callerPeerId: peer.current.id,
        targetId: friendId,
        targetSlug: friendSlug,
        friendId: friendId,
        friendName: friendName,
        friendSlug: friendSlug,
        friendPeerId: friendPeerId,
        callType: callType,
        isInitiator: true,
        timestamp: Date.now()
      };
      
      // Save outgoing call data using our helper utility
      const saveSuccess = callHelper.saveOutgoingCall(callData);
      
      if (!saveSuccess) {
        console.error("Failed to save call data, saving directly to sessionStorage");
        // Fallback: save directly to sessionStorage
        sessionStorage.setItem('callData', JSON.stringify(callData));
      }
      
      // Double-check that data was saved
      const sessionCallData = sessionStorage.getItem('callData');
      if (!sessionCallData || !saveSuccess) {
        console.error("Critical error: Call data not saved properly. Trying again...");
        // Try one more time with both methods
        sessionStorage.setItem('callData', JSON.stringify(callData));
        callHelper.saveOutgoingCall(callData); // Try helper again too
      }
      
      // NOTIFY FRIEND: Use socket emission strategies for maximum reliability
      if (socket.current) {
        console.log("Sending call notifications through all available channels");
        
        // Primary Socket Notification Method - will be handled by server to notify the recipient
        socket.current.emit("initiateCall", callData);
        
        // SOLUTION 1: Emit to ALL online users with filtering - most reliable method
        socket.current.emit("globalCallAnnouncement", callData);
        
        // Send 3 times with delay to maximize chance of success
        setTimeout(() => {
          socket.current.emit("globalCallAnnouncement", {...callData, retry: 1});
        }, 500);
        
        setTimeout(() => {
          socket.current.emit("globalCallAnnouncement", {...callData, retry: 2});
        }, 1500);
        
        // SOLUTION 2: Emergency direct call notification
        socket.current.emit("emergencyDirectCall", callData);
        
        // SOLUTION 3: Use broadcast method as backup
        socket.current.emit("broadcastCall", callData);
        
        // SOLUTION 4: Try direct socket-to-socket signaling (if recipient is connected)
        socket.current.emit("directCallSignal", callData);
        
        // SOLUTION 5: Use REST API as additional fallback (handled by helper)
        callHelper.notifyServerOfCall(callData);
      }
      
      // Short delay to ensure the call data is saved before navigation
      setTimeout(() => {
        // Navigate to video call page with all needed parameters
        window.location.href = `/call/${friendSlug}?callType=${callType}&friendName=${encodeURIComponent(friendName)}`;
      }, 500); // Increase timeout to ensure notifications are sent
    } catch (err) {
      console.error('Error starting call:', err);
      alert(`Could not start call: ${err.message}`);
      setActiveCall({ isActive: false });
      callHelper.clearOutgoingCall();
    }
  };

  // Function to accept incoming call
  const acceptCall = () => {
    console.log("Accepting call:", incomingCall);
    
    if (!incomingCall) {
      console.error("No incoming call data found when accepting call");
      return;
    }

    try {
      // Try to play a sound to ensure audio context is activated
      const audio = new Audio();
      audio.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
      audio.play().catch(e => console.log("Could not play audio ping", e));
      
      // Calling from the acceptCall UI - prepare call data
      const callData = {
        callerId: incomingCall.callerId,
        callerName: incomingCall.callerName,
        callerPeerId: incomingCall.callerPeerId,
        callType: incomingCall.callType,
        targetId: userId,
        friendId: incomingCall.callerId,
        friendName: incomingCall.callerName,
        friendPeerId: incomingCall.callerPeerId,
        isInitiator: false,
        timestamp: Date.now()
      };
      
      // Save call data to session before navigation
      sessionStorage.setItem('callData', JSON.stringify(callData));
      
      // Also save in localStorage for reliability
      const saveSuccess = callHelper.saveOutgoingCall(callData);
      console.log("Call data saved successfully:", saveSuccess);
      
      // Let caller know we've accepted
      if (socket.current) {
        socket.current.emit("callAccepted", {
          callerId: incomingCall.callerId,
          accepterId: userId,
          callerPeerId: incomingCall.callerPeerId,
          callType: incomingCall.callType
        });
        console.log("Emitted callAccepted event");
      }
      
      // Stop ringtone
      callHelper.stopCallSound();
      
      // Clear incoming call data since we're handling it now
      callHelper.clearIncomingCall();
        setIncomingCall(null);
      
      // Navigate to call screen
      console.log(`Navigating to /call/${friendSlug}?callType=${incomingCall.callType}&friendName=${encodeURIComponent(incomingCall.callerName)}`);
      window.location.href = `/call/${friendSlug}?callType=${incomingCall.callType}&friendName=${encodeURIComponent(incomingCall.callerName)}`;
    } catch (error) {
      console.error("Error accepting call:", error);
      alert("Could not accept call. Please try again.");
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

    // Clear any stored call data
    callHelper.clearIncomingCall();
  }, [incomingCall, friendSlug, userId]);

  // Send Chat Message
  const sendMessage = async () => {
    if (input.trim() !== "") {
      try {
        // Generate a temporary ID to track this message
        const tempId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        
        // Create message object that will be consistent for both API and socket
        const messageData = {
          id: tempId,
          senderId: userId,
          receiverId: friendId,
          text: input.trim(),
          timestamp: new Date().toISOString(),
          _locally_added: true // Mark as locally added
        };

        // Add to tracking set to prevent duplicate from socket
        sentMessagesRef.current.add(input.trim());

        // Update UI immediately for better user experience
        setMessages(prevMessages => [...prevMessages, messageData]);

        // Reset input field immediately for better UX
        setInput("");
        
        // First save message to database
        const response = await sendMessages(friendSlug, input.trim());
        console.log("📤 Message sent response:", response?.data);
        
        // Get the proper timestamp from the response
        let messageTimestamp = new Date().toISOString();
        let messageId = tempId;
        
        // Extract proper data from response
        if (response?.data) {
          if (response.data.id) messageId = response.data.id;
          else if (response.data.data?.id) messageId = response.data.data.id;
          
          if (response.data.createdAt) messageTimestamp = response.data.createdAt;
          else if (response.data.data?.createdAt) messageTimestamp = response.data.data.createdAt;
          else if (response.data.timestamp) messageTimestamp = response.data.timestamp;
          else if (response.data.data?.timestamp) messageTimestamp = response.data.data.timestamp;
        }
        
        console.log("📤 Using ID and timestamp for message:", messageId, messageTimestamp);
        
        // Update the message with the proper ID and timestamp from the server
        setMessages(prevMessages => 
          prevMessages.map(msg => 
            msg.id === tempId 
              ? { 
                  ...msg, 
                  id: messageId, 
                  timestamp: messageTimestamp,
                  _locally_added: false
                } 
              : msg
          )
        );
        
        // Send to direct rooms to ensure delivery
        if (socket.current) {
          // Send to multiple possible room formats to ensure delivery
          const possibleRooms = [
            `room-${userId}-${friendId}`,
            `room-${friendId}-${userId}`,
            `${friendId}` // Direct to user
          ];
          
          for (const room of possibleRooms) {
            console.log(`📤 Emitting message to room: ${room}`);
            
            // Send to the room with all possible formats
            socket.current.emit("sendMessage", {
              id: messageId,
              senderId: userId,
              receiverId: friendId,
              message: input.trim(), // 'message' format
              content: input.trim(), // 'content' format
              text: input.trim(),    // 'text' format
              timestamp: messageTimestamp,
              room: room
            });
          }
          
          console.log("📤 Message emitted to all possible rooms");
        }
        
        // Clean up sent message tracking after 10 seconds
        setTimeout(() => {
          sentMessagesRef.current.delete(input.trim());
        }, 10000);
        
        // After sending message, scroll to bottom
        setTimeout(scrollToBottom, 100);

      } catch (error) {
        console.error("Error sending message:", error);
        
        // If API fails, mark message as failed but keep it in the UI
        setMessages(prevMessages => 
          prevMessages.map(msg => 
            msg._locally_added 
              ? { ...msg, _failed: true } 
              : msg
          )
        );
      }
    }
  };

  // Check if message contains only emojis
  const isEmojiOnlyMessage = (message) => {
    // Simplified regex that works better across browsers
    const emojiRegex = /^\p{Emoji}+$/u;
    try {
      return emojiRegex.test(message.trim());
    } catch (e) {
      // Fallback detection for browsers that don't support unicode property escapes
      const simpleEmojiTest = /^[\u{1F300}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]+$/u;
      try {
        return simpleEmojiTest.test(message.trim());
      } catch (e) {
        return false;
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

  // Check for incoming calls stored in localStorage
  useEffect(() => {
    // Only check if we don't have an active incoming call already
    if (!incomingCall) {
      const storedIncomingCall = callHelper.getIncomingCall();
      
      if (storedIncomingCall) {
        console.log("Found stored incoming call:", storedIncomingCall);
        
        // Ignore if it's my own call
        if (storedIncomingCall.callerId === userId) {
          console.log("This is my own stored call, ignoring");
          return;
        }
        
        // Show incoming call notification
        setIncomingCall({
          type: 'localStorage',
          callerId: storedIncomingCall.callerId,
          callerName: storedIncomingCall.callerName,
          callerPeerId: storedIncomingCall.callerPeerId,
          callObject: null,
          callType: storedIncomingCall.callType || 'video'
        });
      }
    }
  }, [incomingCall, userId]);

  // Add a new event listener for the custom incomingCall event
  useEffect(() => {
    const handleIncomingCallEvent = (event) => {
      console.log("Received custom incomingCall event:", event.detail);
      
      // Ignore if it's my own call
      if (event.detail.callerId === userId) {
        console.log("This is my own call event, ignoring");
        return;
      }
      
      // Show incoming call notification
      setIncomingCall({
        type: 'custom',
        callerId: event.detail.callerId,
        callerName: event.detail.callerName,
        callerPeerId: event.detail.callerPeerId,
        callObject: null,
        callType: event.detail.callType || 'video'
      });
    };
    
    // Add event listener
    window.addEventListener("incomingCall", handleIncomingCallEvent);
    
    // Cleanup
    return () => {
      window.removeEventListener("incomingCall", handleIncomingCallEvent);
    };
  }, [userId]);

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
                <span className={`status-text ${onlineStatus ? 'text-success' : 'text-secondary'}`}>
                  {onlineStatus ? "Active now" : "Offline"}
                </span>
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
            <div className="incoming-call-overlay" style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.8)',
              zIndex: 9999,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center'
            }}>
              <div className="incoming-call-box" style={{
                backgroundColor: '#fff',
                borderRadius: '10px',
                padding: '30px',
                textAlign: 'center',
                maxWidth: '400px',
                width: '90%',
                boxShadow: '0 5px 15px rgba(0,0,0,0.3)'
              }}>
                <div className={`pulse-icon mb-3 ${incomingCall.callType === "audio" ? "bg-primary" : "bg-success"} text-white rounded-circle d-flex justify-content-center align-items-center mx-auto`}
                     style={{ width: "80px", height: "80px", animation: "pulse 1s infinite" }}>
                  {incomingCall.callType === "audio" ? <FaPhoneAlt size={32} /> : <FaVideo size={32} />}
                </div>
                <h4 className="mb-3">Incoming {incomingCall.callType === "audio" ? "Audio" : "Video"} Call</h4>
                <p className="mb-4">{incomingCall.callerName || friendName || "Your friend"} is calling...</p>
                <div className="d-flex justify-content-center">
                  <button className="btn call-button call-button-accept me-3" 
                    style={{
                      backgroundColor: '#4CAF50',
                      color: 'white',
                      fontWeight: 'bold',
                      padding: '10px 20px',
                      fontSize: '16px'
                    }}
                    onClick={acceptCall}>
                    <FaPhoneAlt /> Accept
                  </button>
                  <button className="btn call-button call-button-reject" 
                    style={{
                      backgroundColor: '#f44336',
                      color: 'white',
                      fontWeight: 'bold',
                      padding: '10px 20px',
                      fontSize: '16px'
                    }}
                    onClick={rejectCall}>
                    <FaPhoneSlash /> Decline
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Chat Messages Body */}
          <div className="chat-body flex-grow-1 overflow-auto p-3" ref={messageContainerRef}>
            {Array.isArray(messages) && messages.length > 0 ? (
              messages.map((msg, index) => {
                if (msg.type === 'status') {
                  return (
                    <div key={msg.id || index} className="status-message text-center my-2">
                      <span className="status-badge px-2 py-1">
                        {msg.text}
                      </span>
                </div>
                  );
                }

                const messageContent = msg.text || msg.content || msg.message || "";
                const isSentByMe = String(msg.senderId) === String(userId);
                const timestamp = new Date(msg.timestamp || msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const isEmojiOnly = isEmojiOnlyMessage(messageContent);
                
                return (
                  <div key={index} className={`d-flex mb-2 ${isSentByMe ? "justify-content-end" : "justify-content-start"}`}>
                    <div style={{maxWidth: "70%"}}>
                      <div 
                        className={`message-bubble ${isSentByMe ? "sent" : "received"} ${isEmojiOnly ? "emoji-message" : ""}`}
                        style={{
                          fontSize: isEmojiOnly ? "2rem" : "inherit",
                          padding: isEmojiOnly ? "0.25rem 0.5rem" : "0.75rem 1rem",
                          backgroundColor: isEmojiOnly ? "transparent" : "",
                          color: isEmojiOnly ? "inherit" : "",
                          textShadow: isEmojiOnly ? "none" : "",
                          fontFamily: "Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, Android Emoji, EmojiSymbols, sans-serif"
                        }}
                      >
                        {messageContent}
                        {!isEmojiOnly && (
                          <div className="message-options">
                            <button className="btn" onClick={() => {/* Add your message options handler here */}}>
                              <i className="fas fa-ellipsis-v"></i>
                            </button>
              </div>
                        )}
                      </div>
                      <div className="message-timestamp">
                        {formatTime(msg.timestamp)}
                      </div>
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

          {/* Chat Input + Send Button */}
          <div className="chat-footer d-flex p-2 border-top">
            <div className="position-relative d-flex flex-grow-1">
              <button 
                className="emoji-btn" 
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                title="Add emoji"
                aria-label="Add emoji"
                data-bs-toggle="tooltip"
                data-bs-placement="top"
              >
                <FaSmile />
              </button>
              
              {showEmojiPicker && (
                <div 
                  className="emoji-picker-container" 
                  ref={emojiPickerRef}
                  style={{
                    position: 'absolute', 
                    bottom: '50px', 
                    left: '0', 
                    zIndex: 10,
                    backgroundColor: 'white',
                    border: '1px solid #dee2e6',
                    borderRadius: '0.25rem',
                    width: '320px',
                    maxHeight: '350px',
                    overflow: 'auto'
                  }}
                >
                  {/* Simple hardcoded emoji grid for reliability */}
                  <div className="p-2">
                    <div className="d-flex flex-wrap">
                      {/* Common smileys */}
                      {["😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇", 
                        "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘", "😗", "😙", "😚",
                        "😋", "😛", "😝", "😜", "🤪", "🤨", "🧐", "🤓", "😎", "🤩",
                        "😏", "😒", "😞", "😔", "😟", "😕", "🙁", "☹️", "😣", "😖",
                        "😫", "😩", "🥺", "😢", "😭", "😤", "😠", "😡", "🤬", "🤯"
                      ].map((emoji, index) => (
                        <div 
                          key={index} 
                          onClick={() => onEmojiClick({ emoji })}
                          className="emoji-item"
                        >
                          {emoji}
                        </div>
                      ))}
                    </div>
                    
                    <div className="mt-2">
                      <div className="small fw-bold mb-1">Hand Gestures</div>
                      <div className="d-flex flex-wrap">
                        {["👍", "👎", "👌", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉",
                          "👆", "👇", "☝️", "👋", "🤚", "🖐️", "✋", "🖖", "👏", "🙌"
                        ].map((emoji, index) => (
                          <div 
                            key={index} 
                            onClick={() => onEmojiClick({ emoji })}
                            className="emoji-item"
                          >
                            {emoji}
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    <div className="mt-2">
                      <div className="small fw-bold mb-1">Hearts & Love</div>
                      <div className="d-flex flex-wrap">
                        {["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔",
                          "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟", "♥️"
                        ].map((emoji, index) => (
                          <div 
                            key={index} 
                            onClick={() => onEmojiClick({ emoji })}
                            className="emoji-item"
                          >
                            {emoji}
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    <div className="mt-2">
                      <div className="small fw-bold mb-1">Animals</div>
                      <div className="d-flex flex-wrap">
                        {["🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯",
                          "🦁", "🐮", "🐷", "🐸", "🐵", "🐔", "🐧", "🐦", "🦆", "🦅"
                        ].map((emoji, index) => (
                          <div 
                            key={index} 
                            onClick={() => onEmojiClick({ emoji })}
                            className="emoji-item"
                          >
                            {emoji}
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    <div className="mt-2">
                      <div className="small fw-bold mb-1">Food & Drink</div>
                      <div className="d-flex flex-wrap">
                        {["🍎", "🍓", "🍒", "🍕", "🍔", "🍟", "🍖", "🍗", "🥩", "🥓",
                          "🌮", "🌯", "🍣", "🍤", "🍦", "🍩", "🍰", "🧁", "🥂", "☕"
                        ].map((emoji, index) => (
                          <div 
                            key={index} 
                            onClick={() => onEmojiClick({ emoji })}
                            className="emoji-item"
                          >
                            {emoji}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-2">
                      <div className="small fw-bold mb-1">Travel & Places</div>
                      <div className="d-flex flex-wrap">
                        {["🏠", "🏡", "🏢", "🏣", "🏤", "🏥", "🏦", "🏨", "🏩", "🏪",
                          "🚗", "🚕", "🚙", "🚌", "🚎", "🏎️", "🚓", "🚑", "🚒", "✈️"
                        ].map((emoji, index) => (
                          <div 
                            key={index} 
                            onClick={() => onEmojiClick({ emoji })}
                            className="emoji-item"
                          >
                            {emoji}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-2">
                      <div className="small fw-bold mb-1">Flags</div>
                      <div className="d-flex flex-wrap">
                        {["🇺🇸", "🇬🇧", "🇨🇦", "🇦🇺", "🇮🇳", "🇯🇵", "🇰🇷", "🇫🇷", "🇩🇪", "🇮🇹", 
                          "🇧🇷", "🇲🇽", "🇪🇸", "🇷🇺", "🇨🇳", "🇿🇦", "🇸🇦", "🇦🇪", "🇳🇬", "🇪🇬",
                          "🇵🇰", "🇵🇭", "🇸🇪", "🇳🇴", "🇫🇮", "🇵🇹", "🇮🇪", "🇧🇪", "🇦🇷", "🇨🇱",
                          "🇨🇴", "🇵🇪", "🇧🇴", "🇻🇪", "🇹🇷", "🇬🇷", "🇮🇱", "🇮🇷", "🇿🇼", "🇰🇪"
                        ].map((emoji, index) => (
                          <div 
                            key={index} 
                            onClick={() => onEmojiClick({ emoji })}
                            className="emoji-item"
                          >
                            {emoji}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-2">
                      <div className="small fw-bold mb-1">Activities & Sports</div>
                      <div className="d-flex flex-wrap">
                        {["⚽", "🏀", "🏈", "⚾", "🎾", "🏐", "🏉", "🎱", "🏓", "🏸",
                          "🥊", "🥋", "🎣", "🏹", "🎯", "🥌", "🛷", "🎮", "🎲", "♟️"
                        ].map((emoji, index) => (
                          <div 
                            key={index} 
                            onClick={() => onEmojiClick({ emoji })}
                            className="emoji-item"
                          >
                            {emoji}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-2">
                      <div className="small fw-bold mb-1">Objects</div>
                      <div className="d-flex flex-wrap">
                        {["📱", "💻", "⌚", "📷", "🔋", "💡", "🔍", "🔑", "🔒", "📁",
                          "📅", "📌", "📎", "✂️", "📝", "📚", "📰", "🎵", "🎬", "🎨"
                        ].map((emoji, index) => (
                          <div 
                            key={index} 
                            onClick={() => onEmojiClick({ emoji })}
                            className="emoji-item"
                          >
                            {emoji}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-2">
                      <div className="small fw-bold mb-1">Symbols</div>
                      <div className="d-flex flex-wrap">
                        {["💯", "⚠️", "🚫", "✅", "❌", "⭕", "📛", "🔞", "☢️", "☣️",
                          "⬆️", "↗️", "➡️", "↘️", "⬇️", "↙️", "⬅️", "↖️", "↕️", "↔️"
                        ].map((emoji, index) => (
                          <div 
                            key={index} 
                            onClick={() => onEmojiClick({ emoji })}
                            className="emoji-item"
                          >
                            {emoji}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              <input 
                type="text" 
                className="form-control ms-2" 
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
            </div>
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