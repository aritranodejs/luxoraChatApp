import React, { useState, useEffect, useRef, useCallback } from "react";
import { FaPhoneAlt, FaVideo, FaPhoneSlash, FaPaperPlane, FaSmile, FaBell, FaBellSlash, FaCamera, FaEllipsisV, FaArrowLeft, FaShieldAlt, FaFlag, FaExternalLinkAlt, FaTimes } from "react-icons/fa";
import Peer from "peerjs";
import { io } from "socket.io-client";
import { updatePeerId, getFriend } from "../services/friendService";
import { getUser } from "../utils/authHelper";
import { getChats, sendMessages } from "../services/chatService"; // ✅ Import chat API functions
import "../styles/ChatWindow.css"; // Import the CSS file
import * as callHelper from "../utils/callHelper"; // Import call helper utilities
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';
import { formatLastSeen } from "../utils/formatOnlineStatus";

// Add the LinkPreview component before the ChatWindow component
const LinkPreview = ({ url, preview, isLoading }) => {
  const [collapsed, setCollapsed] = useState(false);
  
  // Helper function to safely extract domain from URL
  const getDomain = (url) => {
    return url.replace(/^https?:\/\//, '').split('/')[0].replace('www.', '');
  };
  
  if (isLoading) {
    return (
      <div className="link-preview-loading">
        <div className="spinner-border spinner-border-sm text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <span className="ms-2">Loading preview...</span>
      </div>
    );
  }
  
  if (!preview || collapsed) {
    return collapsed ? (
      <div className="link-preview-collapsed" onClick={() => setCollapsed(false)}>
        <FaExternalLinkAlt size={12} className="me-1" />
        <span className="preview-site">{getDomain(url)}</span>
      </div>
    ) : null;
  }
  
  const { title, description, image, siteName, error } = preview;
  
  if (error) {
    return (
      <div className="link-preview-error">
        <a href={url} target="_blank" rel="noopener noreferrer" className="preview-link">
          <FaExternalLinkAlt size={12} className="me-1" />
          {url}
        </a>
      </div>
    );
  }
  
  return (
    <div className="link-preview">
      <div className="preview-header">
        <span className="preview-site">{siteName}</span>
        <button 
          className="preview-collapse-btn" 
          onClick={() => setCollapsed(true)}
          aria-label="Collapse preview"
        >
          <FaTimes size={12} />
        </button>
      </div>
      
      <a href={url} target="_blank" rel="noopener noreferrer" className="preview-content">
        {image && (
          <div className="preview-image">
            <img src={image} alt={title} onError={(e) => e.target.style.display = 'none'} />
          </div>
        )}
        <div className="preview-text">
          <h5 className="preview-title">{title}</h5>
          {description && <p className="preview-description">{description}</p>}
        </div>
      </a>
    </div>
  );
};

// Add a shared URL regex pattern at the component level
// This regex matches URLs more accurately and handles special cases
// Negative lookahead and lookbehind to avoid URLs in HTML tags
// Handles URLs with @ prefix, URL encoding, and other special cases
// Also handles domain names without http:// or https:// prefixes
const URL_REGEX_PATTERN = /(?<!<a[^>]*>|="|=')(?<!["'])(@?(?:https?:\/\/)?(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&//=]*))(?![^<]*<\/a>|["'])/gi;

const ChatWindow = ({ friendSlug }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [onlineStatus, setOnlineStatus] = useState(false);
  const [friendPeerId, setFriendPeerId] = useState(null);
  const [friendName, setFriendName] = useState("");
  const [friendId, setFriendId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [incomingCall, setIncomingCall] = useState(null);
  const [activeCall, setActiveCall] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showFriendProfile, setShowFriendProfile] = useState(false);
  const [showNotifications, setShowNotifications] = useState(true);
  const [linkPreviews, setLinkPreviews] = useState({});
  const [loadingPreviews, setLoadingPreviews] = useState({});
  const [inputUrls, setInputUrls] = useState([]);
  const [sharedMedia, setSharedMedia] = useState([
    { type: 'image', url: 'https://picsum.photos/200/300?random=1', date: '2 weeks ago' },
    { type: 'image', url: 'https://picsum.photos/200/300?random=2', date: '3 weeks ago' },
    { type: 'image', url: 'https://picsum.photos/200/300?random=3', date: '1 month ago' }
  ]);

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

  // Add these state variables at the top of your component
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editMessageText, setEditMessageText] = useState("");
  const [activeMessageId, setActiveMessageId] = useState(null);

  // Add these state variables at the top of the ChatWindow component
  const [notificationPermission, setNotificationPermission] = useState('default');
  const [windowFocused, setWindowFocused] = useState(true);

  // Add state to track if audio has been initialized by user interaction
  const [audioInitialized, setAudioInitialized] = useState(false);
  const audioContext = useRef(null);
  const messageSound = useRef(null);
  
  // Add state to track notification permission
  const [notificationStatus, setNotificationStatus] = useState('unknown');

  // Add friendLastSeen state to track when the friend was last online
  const [friendLastSeen, setFriendLastSeen] = useState(null);

  // Add a new state for tracking if friend is not found
  const [friendNotFound, setFriendNotFound] = useState(false);

  // Add a flag to track if PeerJS should be initialized
  const [shouldInitPeer, setShouldInitPeer] = useState(false);

  // Add isAI to the state variables
  const [friendData, setFriendData] = useState(null);
  const [isAI, setIsAI] = useState(false);

  // Add state to track if friend is typing
  const [isTyping, setIsTyping] = useState(false);

  // Add a ref for the typing timeout
  const typingTimeout = useRef(null);

  // Add a ref to track if user is typing
  const isUserTyping = useRef(false);

  // Add directRoom state or reference
  const [directRoom, setDirectRoom] = useState(null);

  // Add socket listeners for typing indicators in the initialization useEffect
  useEffect(() => {
    if (!socket.current) return;

    // Add listeners for typing indicators
    socket.current.on("friendTyping", (data) => {
      if (data.senderId === friendId) {
        setIsTyping(true);
        
        // Auto clear typing indicator after some time in case the stop typing event is missed
        clearTimeout(typingTimeout.current);
        typingTimeout.current = setTimeout(() => {
          setIsTyping(false);
        }, 3000);
      }
    });
    
    socket.current.on("friendStoppedTyping", (data) => {
      if (data.senderId === friendId) {
        setIsTyping(false);
      }
    });

    return () => {
      // Other cleanup code...
      socket.current.off("friendTyping");
      socket.current.off("friendStoppedTyping");
      clearTimeout(typingTimeout.current);
    };
  }, [socket, friendId]);

  // Update handleInputChange to emit typing events
  const handleInputChange = (e) => {
    const value = e.target.value;
    setInput(value);
    
    // Detect URLs in input
    const urls = extractUrls(value);
    if (JSON.stringify(urls) !== JSON.stringify(inputUrls)) {
      setInputUrls(urls);
      
      // Fetch previews for new URLs
      urls.forEach(url => {
        if (!linkPreviews[url] && !loadingPreviews[url]) {
          fetchLinkPreview(url);
        }
      });
    }
    
    // Add typing indicator logic
    if (socket.current) {
      if (value.trim() !== '') {
        // Only emit if not already typing
        if (!isUserTyping.current) {
          isUserTyping.current = true;
          socket.current.emit('typing', {
            senderId: userId,
            receiverId: friendId,
            room: directRoom
          });
        }
        
        // Clear the typing timeout and set a new one
        clearTimeout(typingTimeout.current);
        typingTimeout.current = setTimeout(() => {
          isUserTyping.current = false;
          socket.current.emit('stopTyping', {
            senderId: userId,
            receiverId: friendId,
            room: directRoom
          });
        }, 2000);
      } else {
        // If input is empty, immediately emit stop typing
        if (isUserTyping.current) {
          isUserTyping.current = false;
          socket.current.emit('stopTyping', {
            senderId: userId,
            receiverId: friendId,
            room: directRoom
          });
        }
      }
    }
  };

  // Create a more reliable sound player function
  const playNotificationSound = useCallback((soundType = 'message') => {
    console.log("Attempting to play notification sound:", soundType);
    
    try {
      // Initialize audio context if not already done (requires user interaction first)
      if (!audioContext.current && window.AudioContext) {
        audioContext.current = new (window.AudioContext || window.webkitAudioContext)();
        console.log("AudioContext initialized:", audioContext.current.state);
      }
      
      // If we have an audio context and it's in suspended state, resume it
      if (audioContext.current && audioContext.current.state === 'suspended') {
        audioContext.current.resume().then(() => {
          console.log("AudioContext resumed successfully");
        }).catch(err => {
          console.error("Failed to resume AudioContext:", err);
        });
      }
      
      // Simple beep using AudioContext
      if (audioContext.current && audioContext.current.state === 'running') {
        // Create oscillator for a simple beep
        const oscillator = audioContext.current.createOscillator();
        const gainNode = audioContext.current.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.current.destination);
        
        // Different sound types
        if (soundType === 'message') {
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(660, audioContext.current.currentTime);
          gainNode.gain.setValueAtTime(0.2, audioContext.current.currentTime);
          oscillator.start(audioContext.current.currentTime);
          oscillator.stop(audioContext.current.currentTime + 0.1);
        } else if (soundType === 'offline') {
          // Two-tone notification for offline messages
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(523.25, audioContext.current.currentTime); // C5
          gainNode.gain.setValueAtTime(0.2, audioContext.current.currentTime);
          oscillator.start(audioContext.current.currentTime);
          oscillator.frequency.setValueAtTime(659.25, audioContext.current.currentTime + 0.1); // E5
          oscillator.stop(audioContext.current.currentTime + 0.2);
        }
        
        console.log("Sound played successfully using AudioContext");
        return;
      }
      
      // Fallback to Audio API
      const audio = new Audio();
      
      if (soundType === 'message') {
        // Short simple beep for message notifications
        audio.src = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA/+M4wAAAAAAAAAAAAEluZm8AAAAPAAAAAwAAAbAAyMjIyMjIyMjIyMjIyMjIyMjIyMjI+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+P////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAYAAAAAAAAAAbBFZ8yAAAAAAAAAAAAAAAAA/+MYxAAKQAJYGUQAAAOAEBw5JOWmM4xCWDYx/+MYxAgK0AJPGUEAAAkBmZ4wH///y45F/+MYxA0AAAAAAAA//8Uc////o//4';
      } else if (soundType === 'offline') {
        // Longer sound for offline message notification
        audio.src = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA/+M4wAAAAAAAAAAAAEluZm8AAAAPAAAAAwAAAbAAyMjIyMjIyMjIyMjIyMjIyMjIyMjI+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+P////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAYAAAAAAAAAAbBW58KCAAAAAAAAAAAAAAAAA/+MYxAALAQpYGcQQAAQCAMRIxMI7/pRzTpMizFpMO/+MYxAsKyAJoGcEAAAgI4ch/y45MSEJ48qIj/8co/+MYxBIKaL5EWcEAACc4zs08OB5//Ko////4';
      }
      
      audio.volume = 0.3;
      
      // Play the sound with promise handling for modern browsers
      const playPromise = audio.play();
      
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log("Audio played successfully using Audio API");
            // Store reference to initialized audio element
            if (soundType === 'message') {
              messageSound.current = audio;
            }
          })
          .catch(error => {
            console.error("Audio playback failed:", error);
            // Try once more with user interaction
            if (!audioInitialized) {
              console.log("Audio not initialized - requires user interaction first");
            }
          });
      }
    } catch (error) {
      console.error("Error playing notification sound:", error);
    }
  }, [audioInitialized]);

  // Initialize audio on first user interaction
  useEffect(() => {
    const initializeAudio = () => {
      if (!audioInitialized) {
        // Try to create and resume AudioContext
        try {
          if (!audioContext.current && window.AudioContext) {
            audioContext.current = new (window.AudioContext || window.webkitAudioContext)();
            console.log("AudioContext initialized on user interaction");
          }
          
          if (audioContext.current && audioContext.current.state === 'suspended') {
            audioContext.current.resume().then(() => {
              console.log("AudioContext resumed on user interaction");
              setAudioInitialized(true);
            });
          } else {
            setAudioInitialized(true);
          }
          
          // Also try to play a silent sound to initialize Audio API
          const audio = new Audio('data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA/+M4wAAAAAAAAAAAAEluZm8AAAAPAAAAAwAAAbAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAL/80LAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
          audio.volume = 0;
          const silentPlay = audio.play();
          if (silentPlay !== undefined) {
            silentPlay.catch(e => console.log("Silent audio initialization failed:", e));
          }
        } catch (error) {
          console.error("Audio initialization error:", error);
        }
      }
    };

    // Add event listeners for user interaction
    document.addEventListener('click', initializeAudio);
    document.addEventListener('touchstart', initializeAudio);
    document.addEventListener('keydown', initializeAudio);
    
    return () => {
      document.removeEventListener('click', initializeAudio);
      document.removeEventListener('touchstart', initializeAudio);
      document.removeEventListener('keydown', initializeAudio);
    };
  }, [audioInitialized]);

  // Update the show notification function to use our new sound player
  const showMessageNotification = useCallback((senderName, messageContent) => {
    // Play notification sound regardless of window focus
    playNotificationSound('message');
    
    console.log("Showing message notification:", {
      senderName, 
      messageLength: messageContent?.length,
      permission: Notification.permission, 
      windowFocused
    });
    
    // Only show visual notification if window is not focused
    if (windowFocused) {
      console.log("Window is focused, skipping visual notification");
      return;
    }
    
    // Don't show visual notification if we don't have permission
    if (Notification.permission !== 'granted') {
      console.log("No notification permission granted");
      return;
    }
    
    try {
      // Make notification unique and eye-catching
      const notification = new Notification(`New Message from ${senderName}`, {
        body: messageContent.length > 60 ? messageContent.substring(0, 57) + '...' : messageContent,
        icon: 'https://via.placeholder.com/192x192.png?text=LUXORA', // Large eye-catching icon
        badge: 'https://via.placeholder.com/96x96.png?text=L',
        vibrate: [200, 100, 200], // Vibration pattern for mobile
        requireInteraction: true, // Keep notification until user interacts with it
        tag: `msg-${Date.now()}`, // Unique tag to prevent overwriting
        renotify: true, // Show even if a notification with the same tag exists
      });
      
      console.log("Notification created:", notification);
      
      notification.onclick = () => {
        // Focus the window when the notification is clicked
        window.focus();
        notification.close();
        console.log("Notification clicked, window focused");
      };
      
      // Keep notification visible for a good amount of time
      setTimeout(() => {
        try {
          notification.close();
        } catch (e) {
          console.log("Error closing notification:", e);
        }
      }, 8000);
      
      // Create a second notification slightly delayed for mobile devices (more likely to show)
      if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
        console.log("Mobile device detected, sending second notification");
        setTimeout(() => {
          try {
            const mobileNotification = new Notification(`💬 ${senderName}`, {
              body: messageContent.substring(0, 50),
              requireInteraction: true,
              tag: `mobile-${Date.now()}` // Different tag to show both
            });
            setTimeout(() => mobileNotification.close(), 10000);
          } catch (e) {
            console.log("Mobile notification failed:", e);
          }
        }, 500);
      }
    } catch (error) {
      console.error("Error showing notification:", error);
      // Try simpler notification
      try {
        const simpleNotification = new Notification(senderName, {
          body: messageContent.substring(0, 30)
        });
        console.log("Fallback notification created:", simpleNotification);
      } catch (e) {
        console.error("Even simple notification failed:", e);
      }
    }
  }, [playNotificationSound, windowFocused]);

  // Request notification permission
  const requestNotificationPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      console.log('This browser does not support notifications');
      setNotificationStatus('unsupported');
      return;
    }

    if (Notification.permission === 'granted') {
      setNotificationPermission('granted');
      setNotificationStatus('granted');
      console.log("Notification permission already granted");
      
      // Test notification to verify it works
      try {
        const testNotification = new Notification("Notifications enabled", {
          body: "You will now receive message notifications",
          icon: 'https://via.placeholder.com/192x192.png?text=LX',
          requireInteraction: true
        });
        
        setTimeout(() => testNotification.close(), 3000);
        console.log("Test notification sent");
      } catch(e) {
        console.error("Error sending test notification:", e);
      }
      return;
    }

    if (Notification.permission !== 'denied') {
      try {
        console.log("Requesting notification permission...");
        const permission = await Notification.requestPermission();
        console.log("Permission response:", permission);
        setNotificationPermission(permission);
        setNotificationStatus(permission);
        
        if (permission === 'granted') {
          // Immediately show a test notification
          try {
            const testNotification = new Notification("Notifications enabled", {
              body: "You will now receive message notifications",
              icon: 'https://via.placeholder.com/192x192.png?text=LX',
              requireInteraction: true
            });
            
            setTimeout(() => testNotification.close(), 3000);
          } catch(e) {
            console.error("Error sending test notification:", e);
          }
        }
      } catch (error) {
        console.error('Error requesting notification permission:', error);
        setNotificationStatus('error');
      }
    } else {
      setNotificationStatus('denied');
      console.log("Notification permission denied");
    }
  }, []);

  // Track window focus
  useEffect(() => {
    const handleFocus = () => setWindowFocused(true);
    const handleBlur = () => setWindowFocused(false);

    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    // Initial permission check
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    }

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  // Add this inside the component return, somewhere near the top
  useEffect(() => {
    // Request notification permission when notifications are enabled
    if (showNotifications) {
      requestNotificationPermission();
    }
  }, [showNotifications, requestNotificationPermission]);

  // Add emoji handler function 
  const handleEmojiSelect = (emoji) => {
    const input = document.querySelector('.chat-footer input');
    const cursorPosition = input.selectionStart;
    
    // Insert emoji at cursor position
    const newMessage = input.value.substring(0, cursorPosition) + emoji.native + input.value.substring(cursorPosition);
    setInput(newMessage);
    
    // Focus input and set cursor position after emoji
    setTimeout(() => {
      input.focus();
      input.selectionStart = cursorPosition + emoji.native.length;
      input.selectionEnd = cursorPosition + emoji.native.length;
    }, 10);
  };

  // Mark messages as read function
  const markMessagesAsRead = useCallback(() => {
    if (!userId || !friendId || !socket.current) return;
    
    // Find unread messages from friend
    const unreadMessages = messages.filter(msg => 
      msg.senderId === friendId && 
      msg.status !== "read" && 
      msg.id // Only messages with server IDs
    );
    
    if (unreadMessages.length > 0) {
      console.log("Marking messages as read:", unreadMessages.length);
      
      // Emit read status for each message
      unreadMessages.forEach(msg => {
        socket.current.emit("markMessageRead", {
          messageId: msg.id,
          senderId: userId,
          receiverId: friendId
        });
      });
      
      // Update local state
      setMessages(prev => 
        prev.map(msg => {
          if (msg.senderId === friendId && msg.status !== "read" && msg.id) {
            return { ...msg, status: "read" };
          }
          return msg;
        })
      );
    }
  }, [userId, friendId, messages]);

  // Add this new function to scroll to bottom
  const scrollToBottom = () => {
    if (messageContainerRef.current) {
      // Get the scroll height and make sure we're at the bottom
      const scrollHeight = messageContainerRef.current.scrollHeight;
      const height = messageContainerRef.current.clientHeight;
      const maxScrollTop = scrollHeight - height;
      
      // Use smooth scrolling for better UX
      messageContainerRef.current.scrollTo({
        top: maxScrollTop > 0 ? maxScrollTop : 0,
        behavior: 'smooth'
      });
      
      // Mark messages as read when scrolling to bottom
      markMessagesAsRead();
      
      // For browsers that don't support scrollTo with behavior
      // This is a fallback
      if (maxScrollTop > 0 && messageContainerRef.current.scrollTop < maxScrollTop) {
        messageContainerRef.current.scrollTop = maxScrollTop;
      }
    }
  };

  // Update useEffect for messages
  useEffect(() => {
    scrollToBottom();
    
    // Mark messages as read when they are loaded/updated
    markMessagesAsRead();
  }, [messages, markMessagesAsRead]);

  // Update useEffect for chat history
  useEffect(() => {
    const fetchChatHistory = async () => {
      try {
        console.log("Starting fetchChatHistory for friend:", friendSlug);
        const response = await getChats(friendSlug);

        if (response?.data && Array.isArray(response.data)) {
          const formattedMessages = response.data.map(msg => ({
            id: msg.id,
            senderId: msg.senderId,
            receiverId: msg.receiverId,
            text: msg.content || msg.text || msg.message || "",
            timestamp: msg.createdAt || msg.timestamp || new Date().toISOString(),
            status: msg.status || "sent"
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
            timestamp: msg.createdAt || msg.timestamp || new Date().toISOString(),
            status: msg.status || "sent"
          }));
          setMessages(formattedMessages);
          // Scroll to bottom after setting messages
          setTimeout(scrollToBottom, 100);
        }

      } catch (error) {
        console.error(" Error fetching chat history:", error);
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
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target) && 
          !event.target.classList.contains('emoji-btn')) {
        setShowEmojiPicker(false);
      }
    }
    
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    // Skip initialization if friend doesn't exist
    if (!shouldInitPeer) return;

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
      try {
        const response = await updatePeerId(friendSlug, id);
        if (response?.data?.id) {
          setFriendId(response.data.id);
        }
      } catch (error) {
        console.error("Error updating peer ID:", error);
        // Continue with the rest of the setup even if updatePeerId fails
      }
      
      // Continue with socket setup...
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
      if (peer.current) peer.current.destroy();
      if (socket.current) socket.current.disconnect();
    };
  }, [friendSlug, userId, url, shouldInitPeer]); // Add shouldInitPeer to dependencies

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
      if (String(senderId) === String(userId) && sentMessagesRef.current.has(messageContent)) {
        console.log("📩 Skipping locally sent message received from socket:", messageContent);
        return;
      }
      
      // Always update messages if the message is related to the current chat
      if ((receiverId === userId && senderId === friendId) || 
          (senderId === userId && receiverId === friendId)) {
        console.log(`📩 Message is relevant to current chat: senderId=${senderId}, receiverId=${receiverId}, userId=${userId}, friendId=${friendId}`);
        
        // Show notification if the message is from the friend
        if (senderId === friendId) {
          // Play notification sound for incoming messages
          playNotificationSound('message');
          
          // Show browser notification if notifications are enabled
          // Send directly to notification function rather than checking window focus here
          if (showNotifications && Notification.permission === 'granted') {
            // Log that we're attempting to show a notification
            console.log("Attempting to show notification for incoming message");
            
            // Show notification using our function that handles all edge cases
            showMessageNotification(friendName, messageContent);
            
            // If user isn't focused on this window, also try a direct notification
            // (this is a backup in case our function fails for some reason)
            if (!windowFocused) {
              try {
                const directNotification = new Notification(`Message from ${friendName}`, {
                  body: messageContent.length > 60 ? messageContent.substring(0, 57) + '...' : messageContent,
                  icon: 'https://via.placeholder.com/192x192.png?text=LUXORA',
                  tag: `direct-${Date.now()}`,
                  requireInteraction: true
                });
                console.log("Direct notification created as backup:", directNotification);
              } catch(e) {
                console.error("Direct notification failed:", e);
              }
            }
          } else {
            console.log("Not showing notification:", { 
              showNotifications, 
              permission: Notification.permission,
              focused: windowFocused
            });
          }
        }
        
        // Unique ID for the message
        const messageId = data.id || `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        
        setMessages(prevMessages => {
          // Create message with timestamp
          const newMessage = { 
            id: messageId,
            senderId, 
            receiverId, 
            text: messageContent, // Store as text for UI consistency
            timestamp: data.timestamp || data.createdAt || new Date().toISOString(),
            status: data.status || "sent"
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
          
          // After adding a new message, scroll to bottom
          setTimeout(scrollToBottom, 10);
          
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
      }
    });

    // Listen for friend's reconnection
    socket.current.on("userReconnected", (data) => {
      if (data.userId === friendId) {
        setOnlineStatus(true);
      }
    });

    // Listen for message status updates
    socket.current.on("messageStatus", (data) => {
      console.log("Message status update received:", data);
      if (data.messageId && data.status) {
        setMessages(prev => 
          prev.map(msg => {
            if (msg.id === data.messageId) {
              return { ...msg, status: data.status };
            }
            return msg;
          })
        );
      }
    });

    // Listen for message delivery confirmations 
    socket.current.on("messageDelivered", (data) => {
      console.log("Message delivered:", data);
      if (data.messageId) {
        setMessages(prev => 
          prev.map(msg => {
            if (msg.id === data.messageId && msg.status === "sent") {
              return { ...msg, status: "delivered" };
            }
            return msg;
          })
        );
      }
    });

    // Listen for message read confirmations
    socket.current.on("messageRead", (data) => {
      console.log("Message read:", data);
      if (data.messageId) {
        setMessages(prev => 
          prev.map(msg => {
            if (msg.id === data.messageId && 
                (msg.status === "sent" || msg.status === "delivered")) {
              return { ...msg, status: "read" };
            }
            return msg;
          })
        );
      }
    });

    // Listen for offline notifications when user comes back online
    socket.current.on("offlineNotifications", (data) => {
      // This event is triggered when a user comes back online and has missed messages
      if (data.receiverId === userId) {
        const missedMessages = data.messages || [];
        
        // Process missed messages
        if (missedMessages.length > 0) {
          // Play sound for missed messages
          playNotificationSound('offline');

          // Show notification that summarizes missed messages
          if (Notification.permission === 'granted' && !windowFocused) {
            const notificationTitle = `Missed Messages from ${missedMessages.length} conversations`;
            const notificationOptions = {
              body: `You have ${missedMessages.length} conversations with unread messages while you were offline`,
              icon: '/favicon.ico',
              tag: 'offline-messages', // Add tag to replace existing notifications
              requireInteraction: true, // Keep notification until user interacts with it
            };
            
            try {
              const notification = new Notification(notificationTitle, notificationOptions);
              
              // Focus window when notification is clicked
              notification.onclick = () => {
                window.focus();
                notification.close();
              };
            } catch (error) {
              console.error("Error showing notification:", error);
            }
          }
        }
      }
    });

    // When messages are viewed, emit that they've been read
    socket.current.emit("chatOpened", {
      userId,
      friendId
    });

    // Add this inside your existing useEffect where socket events are set up
    // Find the section where socket.current is initialized and add this listener
    socket.current.on("userStatusChanged", (data) => {
      // Check if this status update is for the current friend we're chatting with
      if (data.userId === friendId) {
        console.log("Friend status changed:", data);
        setOnlineStatus(data.isOnline);
        
        if (!data.isOnline) {
          setFriendLastSeen(data.lastSeen);
        }
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
      socket.current.off("messageStatus");
      socket.current.off("messageDelivered");
      socket.current.off("messageRead");
      socket.current.off("offlineNotifications");
      socket.current.off("userStatusChanged");
      
      // Clear the polling interval
      clearInterval(pollInterval);
    };
  }, [friendId, userId, endCall, activeCall, incomingCall, friendSlug]);

  // Update the fetchFriendData function to set the isAI state
  useEffect(() => {
    const fetchFriendData = async () => {
      try {
        setLoading(true);
        setFriendNotFound(false);
        
        const response = await getFriend(friendSlug);
        
        // Check if response indicates user not found
        if (!response.success || !response?.data?.friend) {
          console.log("Friend not found:", friendSlug);
          setFriendNotFound(true);
          setLoading(false);
          setShouldInitPeer(false); // Don't initialize PeerJS for non-existent friends
          return;
        }
        
        const friendData = response.data.friend;
        if (friendData) {
          setFriendName(friendData.name);
          setFriendId(friendData.id);
          setOnlineStatus(friendData.isOnline || false);
          setFriendPeerId(friendData.peerId);
          setFriendLastSeen(friendData.lastSeen || null);
          setShouldInitPeer(true); // Initialize PeerJS only when friend exists
          
          // Store complete friend data
          setFriendData(friendData);
          
          // Check if the friend is an AI
          setIsAI(!!friendData.isAI);
          
          console.log(`Friend ${friendData.name} isAI:`, !!friendData.isAI);
        }
      } catch (error) {
        console.error("Error fetching friend data:", error);
        setFriendNotFound(true);
        setShouldInitPeer(false); // Don't initialize PeerJS on error
      }
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
          status: msg.status || "sent"
        };
      }).filter(msg => {
        // Filter out invalid messages
        return msg.text && (msg.senderId || msg.receiverId);
      });
      
      // Only update if there's a difference (avoiding endless loop)
      const cleaned = JSON.stringify(cleanedMessages);
      const original = JSON.stringify(messages);
      if (cleaned !== original) {
        console.log(" Cleaned up messages format for consistency:", cleanedMessages);
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

  // Update function to handle message options
  const handleMessageOptions = (messageId) => {
    setActiveMessageId(activeMessageId === messageId ? null : messageId);
  };

  // Add this function to handle starting message editing
  const handleEditMessage = (messageId, messageContent) => {
    setEditingMessageId(messageId);
    setEditMessageText(messageContent);
    setInput(messageContent);
    setActiveMessageId(null);
  };

  // Modify the sendMessage function to check for offline status
  const sendMessage = async () => {
    // Don't send empty messages
    if (!input.trim()) return;

    try {
      const textToSend = input.trim();
      setInput("");
      setInputUrls([]); // Clear input URLs after sending

      if (editingMessageId) {
        // Handle message editing
        const updatedMessages = messages.map(msg => {
          if ((msg.id || msg.tempId) === editingMessageId) {
            return { ...msg, text: textToSend, edited: true };
          }
          return msg;
        });
        setMessages(updatedMessages);
        setEditingMessageId(null);
        setEditMessageText("");
        
        // TODO: Update message on server
        // const response = await updateMessage(editingMessageId, textToSend);
        setTimeout(scrollToBottom, 10); // Scroll to bottom after editing
        return;
      }

      // Create a temporary message ID to track this message
      const tempId = `temp-${Date.now()}`;
      
      // Add message to UI immediately with 'sending' status
      const tempMessage = {
        id: null,
        tempId,
          senderId: userId,
          receiverId: friendId,
        text: textToSend,
        timestamp: new Date().toISOString(),
        status: "sending"
      };
      
      setMessages(prev => [...prev, tempMessage]);
      
      // Scroll to bottom immediately after adding message to UI
      setTimeout(scrollToBottom, 10);
      
      // Add to tracking set
      sentMessagesRef.current.add(tempId);
      
      // Check if recipient is offline and handle notification
      if (!onlineStatus) {
        // Notify the server that a message was sent to an offline user
        if (socket.current) {
          socket.current.emit("offlineMessageSent", {
            senderId: userId,
            senderName: getUser()?.name,
            receiverId: friendId,
            message: textToSend,
            timestamp: new Date().toISOString()
          });
          
          // Also emit an event to notify the recipient when they come back online
          socket.current.emit("offlineNotification", {
            senderId: userId,
            senderName: getUser()?.name || 'User',
            receiverId: friendId,
            message: textToSend,
            timestamp: new Date().toISOString()
          });
          
          console.log(`Sent offline notification for recipient ${friendId}`);
          
          // Play the offline notification sound
          playNotificationSound('offline');
          
          // Show browser notification if we have permission
          if (Notification.permission === 'granted') {
            try {
              // Create a notification that's hard to miss
              const notification = new Notification(`Message to Offline User`, {
                body: `${friendName} will receive your message when they come online`,
                icon: 'https://via.placeholder.com/192x192.png?text=LUXORA',
                requireInteraction: true, // Keep until user interacts
                tag: 'offline-msg-' + Date.now(), // Unique tag to ensure it shows
                vibrate: [200, 100, 200] // Vibration for mobile
              });
              
              // Log for debugging
              console.log("Offline notification created", notification);
              
              // Handle notification clicks
              notification.onclick = () => {
                window.focus();
                notification.close();
              };
              
              // Keep it visible longer
              setTimeout(() => notification.close(), 6000);
            } catch (error) {
              console.error('Error showing offline notification:', error);
              // Fallback to simpler notification
              try {
                new Notification(`Message sent while ${friendName} is offline`);
              } catch(e) {}
            }
          } else {
            console.log("Can't show offline notification, no permission", Notification.permission);
          }
        }
      }
      
      // Send to server
      const response = await sendMessages(friendSlug, textToSend);
      console.log("Message sent, response:", response);

      // Update message with server ID and 'sent' status
      if (response?.data?.id) {
        setMessages(prev => 
          prev.map(msg => 
            msg.tempId === tempId 
              ? { ...msg, id: response.data.id, status: "sent" } 
              : msg
          )
        );
        
        // Scroll to bottom again after status update
        setTimeout(scrollToBottom, 10);
      } else {
        // Even without server ID, update status to sent
        setMessages(prev => 
          prev.map(msg => 
            msg.tempId === tempId 
              ? { ...msg, status: "sent" } 
              : msg
          )
        );
        
        // Scroll to bottom again after status update
        setTimeout(scrollToBottom, 10);
      }

      } catch (error) {
      console.error("Failed to send message:", error);
      // Update message status to 'failed'
      setMessages(prev => 
        prev.map(msg => 
          msg.status === "sending" 
            ? { ...msg, status: "failed" } 
            : msg
        )
      );
    }
  };

  // Add cancel edit function
  const cancelEdit = () => {
    setEditingMessageId(null);
    setEditMessageText("");
        setInput("");
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

  // Add this function to handle profile click
  const toggleFriendProfile = () => {
    setShowFriendProfile(!showFriendProfile);
  };

  // Add this toggle function
  const toggleNotifications = () => {
    setShowNotifications(!showNotifications);
  };

  // Add this function to handle blocking
  const handleBlock = () => {
    if (window.confirm(`Are you sure you want to block ${friendName}?`)) {
      // Implement blocking functionality here
      alert(`${friendName} has been blocked.`);
      toggleFriendProfile();
    }
  };

  // Add this function to handle reporting
  const handleReport = () => {
    if (window.confirm(`Are you sure you want to report ${friendName}?`)) {
      // Implement reporting functionality here
      alert(`${friendName} has been reported.`);
      toggleFriendProfile();
    }
  };

  // Helper function to format dates for the message groups
  const formatMessageDate = (timestamp) => {
    const messageDate = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    // Reset hours to compare only dates
    const messageDay = new Date(messageDate.getFullYear(), messageDate.getMonth(), messageDate.getDate());
    const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const yesterdayDay = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
    
    if (messageDay.getTime() === todayDay.getTime()) {
      return "Today";
    } else if (messageDay.getTime() === yesterdayDay.getTime()) {
      return "Yesterday";
    } else {
      const options = { weekday: 'long' };
      // Check if the message is from this week
      const dayDiff = Math.floor((todayDay - messageDay) / (1000 * 60 * 60 * 24));
      if (dayDiff < 7) {
        return messageDate.toLocaleDateString(undefined, options);
      } else {
        // If older than a week, show the actual date
        return messageDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
      }
    }
  };

  // Add this function to extract URLs from message text
  const extractUrls = (text) => {
    if (!text) return [];
    
    // Create a one-time regex pattern that also matches domain names without protocols
    const urlRegex = /(?:https?:\/\/)?(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi;
    
    const matches = text.match(urlRegex) || [];
    
    // Filter out false positives and add protocol where needed
    return matches.map(url => {
      // Add protocol if missing
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return 'https://' + url;
      }
      return url;
    });
  };

  // Function to fetch metadata for a URL
  const fetchLinkPreview = async (url, messageId) => {
    if (linkPreviews[url] || loadingPreviews[url]) {
      return; // Already fetched or currently fetching
    }

    // Mark as loading
    setLoadingPreviews(prev => ({
      ...prev,
      [url]: true
    }));

    try {
      // Use our own server instead of allorigins to avoid CSP issues
      const proxyUrl = `${url.startsWith('http') ? url : 'https://' + url}`;
      
      // Create a minimal preview without making external requests
      const domain = url.replace(/^https?:\/\//, '').split('/')[0];
      
      // Extract siteName and fallback to domain
      const siteName = domain.replace('www.', '');
      
      // Store the preview data
      setLinkPreviews(prev => ({
        ...prev,
        [url]: {
          title: url,
          description: `Link to ${domain}`,
          image: '',
          siteName,
          url: proxyUrl
        }
      }));

    } catch (error) {
      console.error("Error creating link preview:", error);
      
      // Store a minimal preview
      setLinkPreviews(prev => ({
        ...prev,
        [url]: {
          title: url,
          description: '',
          image: '',
          siteName: url.replace(/^https?:\/\//, '').split('/')[0].replace('www.', ''),
          url,
          error: true
        }
      }));
    } finally {
      // Mark as no longer loading
      setLoadingPreviews(prev => {
        const newState = { ...prev };
        delete newState[url];
        return newState;
      });
    }
  };

  // Detect links in messages and fetch previews
  useEffect(() => {
    // Process new messages to check for URLs
    messages.forEach(msg => {
      if (!msg.text) return;
      
      const urls = extractUrls(msg.text);
      urls.forEach(url => {
        // Fetch preview for each URL that doesn't already have one
        if (!linkPreviews[url] && !loadingPreviews[url]) {
          fetchLinkPreview(url, msg.id || msg.tempId);
        }
      });
    });
  }, [messages, linkPreviews, loadingPreviews]);

  // Initialize directRoom in the socket connection useEffect
  useEffect(() => {
    if (!socket.current || !userId || !friendId) return;
    
    // Create a room ID for direct messaging
    const roomId = [userId, friendId].sort().join('-');
    setDirectRoom(roomId);
    
    // Join the room for this direct conversation
    socket.current.emit("joinChat", { room: roomId });
    console.log("Joined chat room:", roomId);

    // Other socket setup code...
  }, [userId, friendId, socket.current]);

  // Add formatMessageWithCodeBlocks function
  const formatMessageWithCodeBlocks = (message) => {
    if (!message) return '';
    
    // First handle code blocks with triple backticks
    const codeBlockRegex = /```([a-zA-Z]*)\n([\s\S]*?)```/g;
    
    // Check if the message contains code blocks
    const hasCodeBlocks = codeBlockRegex.test(message);
    
    // Reset regex since we used test()
    codeBlockRegex.lastIndex = 0;
    
    let formattedMessage = message;
    let match;
    const blocks = [];
    
    // Find all code blocks
    if (hasCodeBlocks) {
    while ((match = codeBlockRegex.exec(message)) !== null) {
      const fullMatch = match[0];
      let language = match[1].trim().toLowerCase();
      const code = match[2];
      
      // If language isn't specified, detect it
      if (!language) {
        language = detectLanguage(code);
      }
      
      // Create a placeholder to replace the code block
      const placeholder = `__CODE_BLOCK_${blocks.length}__`;
      blocks.push({ language, code });
      
      // Replace the code block with the placeholder
      formattedMessage = formattedMessage.replace(fullMatch, placeholder);
    }
    
    // Replace placeholders with actual HTML
    blocks.forEach((block, index) => {
      const placeholder = `__CODE_BLOCK_${index}__`;
      const escapedCode = escapeHtml(block.code);
      
      // Create a simpler implementation with direct onclick handler
      const codeHtml = `<pre data-language="${block.language}"><code class="language-${block.language}">${escapedCode}</code><button class="code-copy-btn" onclick="
        const code = this.previousElementSibling.innerText;
        
        // Copy to clipboard
        const textarea = document.createElement('textarea');
        textarea.value = code;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        
        try {
          document.execCommand('copy');
          this.innerText = 'Copied!';
          this.style.backgroundColor = 'rgba(40, 167, 69, 0.8)';
        } catch (err) {
          this.innerText = 'Failed';
          this.style.backgroundColor = 'rgba(220, 53, 69, 0.8)';
        }
        
        document.body.removeChild(textarea);
        
        setTimeout(() => {
          this.innerText = 'Copy';
          this.style.backgroundColor = '';
        }, 2000);
      ">Copy</button></pre>`;
      
      formattedMessage = formattedMessage.replace(placeholder, codeHtml);
    });
    }
    
    // Process URLs - convert them to premium-styled clickable links
    // Use the shared URL regex pattern
    formattedMessage = formattedMessage.replace(URL_REGEX_PATTERN, (url) => {
      // First, handle @ symbols at the beginning of URLs
      let finalUrl = url.replace(/^@/, '');
      
      // Handle URL-encoded sequences
      try {
        finalUrl = decodeURIComponent(finalUrl.replace(/%(?![0-9A-Fa-f]{2})/g, '%25'));
      } catch (e) {
        // If decoding fails, use the original
        console.log("URL decoding error:", e);
      }
      
      // Add protocol if missing
      if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
        finalUrl = 'https://' + finalUrl;
      }
      
      // Clean up URL if it has markdown brackets, quotes, or other formatting
      finalUrl = finalUrl.replace(/[\[\]"']/g, '');
      
      // Special case for URLs followed by markdown-style links [text](url)
      if (finalUrl.includes('](')) {
        // Extract URL from markdown format with missing closing parenthesis
        const markdownMatch = finalUrl.match(/\[([^\]]+)\]\(([^)]*)/);
        if (markdownMatch && markdownMatch[2]) {
          finalUrl = markdownMatch[2].trim();
          // Add protocol if missing after extraction
          if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
            finalUrl = 'https://' + finalUrl;
          }
        }
      }
      
      // Handle URLs with parentheses correctly
      if (finalUrl.includes('(') && finalUrl.includes(')')) {
        const match = finalUrl.match(/\(([^)]+)\)/);
        if (match && match[1]) {
          finalUrl = match[1];
          // Add protocol if missing after extraction
          if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
            finalUrl = 'https://' + finalUrl;
          }
        }
      }
      
      // Clean up trailing punctuation
      finalUrl = finalUrl.replace(/[.,;:!?)]$/, '');
      
      // Extract domain for clean display
      let displayText = '';
      try {
        // Extract domain without using URL constructor
        displayText = finalUrl.replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '');
      } catch (e) {
        const parts = finalUrl.split('/');
        displayText = parts.length > 2 ? parts[2] : finalUrl.replace(/^https?:\/\//i, '');
      }
      
      // Use a simple link format that works reliably
      return `<a href="${finalUrl}">${displayText}</a>`;
    });
    
    // Process asterisk formatting for premium look
    // Handle bold (***text***) with premium styling
    formattedMessage = formattedMessage.replace(
      /\*\*\*([^*]+)\*\*\*/g, 
      '<span class="premium-text">$1</span>'
    );
    
    // Handle bold+italic (**text**) with emphasis
    formattedMessage = formattedMessage.replace(
      /\*\*([^*]+)\*\*/g, 
      '<strong>$1</strong>'
    );
    
    // Handle italic (*text*) with subtle emphasis
    formattedMessage = formattedMessage.replace(
      /(?<!\*)\*([^*]+)\*(?!\*)/g, 
      '<em>$1</em>'
    );
    
    // Handle markdown-style links [text](url) - even with unclosed parentheses
    formattedMessage = formattedMessage.replace(
      /\[([^\]]+)\]\(([^)]*)/g,
      (match, text, url) => {
        // Ensure URL has a protocol prefix and is clean
        let cleanUrl = url.trim();
        
        // Handle case where the URL might end with a closing parenthesis
        if (cleanUrl.endsWith(')')) {
          cleanUrl = cleanUrl.slice(0, -1);
        }
        
        if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
          cleanUrl = 'https://' + cleanUrl;
        }
        
        // Simple link format that matches WhatsApp/Teams style
        return `<a href="${cleanUrl}">${text}</a>`;
      }
    );
    
    // Direct fix for specific URL cases with unclosed parentheses
    // These are URLs that end with a closing parenthesis but are missing the matching one
    const urlWithUnclosedParenPattern = /(https?:\/\/[^\s]+)(?:\))+/g;
    formattedMessage = formattedMessage.replace(
      urlWithUnclosedParenPattern,
      (match, url) => {
        // Make sure the parentheses are balanced
        let balanced = 0;
        for (let i = 0; i < url.length; i++) {
          if (url[i] === '(') balanced++;
          else if (url[i] === ')') balanced--;
        }
        
        // If we have more closing than opening parentheses, fix the URL
        if (balanced < 0) {
          const cleanUrl = url.replace(/\)+$/, '');
          return `<a href="${cleanUrl}">${cleanUrl.replace(/^https?:\/\//i, '')}</a>`;
        }
        
        return match;
      }
    );
    
    // Fix for plain URLs like google.com)
    formattedMessage = formattedMessage.replace(
      /\b([a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z0-9]{2,}(?:[-a-zA-Z0-9\/]*))\)/g,
      (match, domain) => {
        // Ensure it's a complete domain without protocol
        if (domain.match(/^[^.]+\.[^.]+/)) {
          return `<a href="https://${domain}">${domain}</a>)`;
        }
        return match;
      }
    );
    
    return formattedMessage;
  };

  // Add helper functions for code formatting
  const detectLanguage = (code) => {
    // Simple language detection based on keywords and syntax
    if ((code.includes('def ') || code.includes('import ')) && code.includes(':')) return 'python';
    if (code.includes('function') || code.includes('const ') || code.includes('let ') || code.includes('var ')) return 'javascript';
    if (code.includes('class ') && code.includes('{')) return 'java';
    if (code.includes('<html') || code.includes('<!DOCTYPE')) return 'html';
    if (code.includes('SELECT ') && code.includes('FROM ')) return 'sql';
    if (code.includes('console.log(') || code.includes('=>')) return 'javascript';
    if (code.includes('public class') || code.includes('using System;')) return 'csharp';
    if (code.includes('<?php')) return 'php';
    if (code.includes('@import') || code.includes('@media') || code.includes('.class {')) return 'css';
    if (code.includes('import React') || code.includes('function Component(') || code.includes('<div>')) return 'jsx';
    if (code.includes('interface ') || code.includes(':') || code.startsWith('import {')) return 'typescript';
    if (code.includes('{') && code.includes('}') && (code.includes('"') || code.includes(':'))) return 'json';
    if (code.includes('#!/bin/') || code.includes('apt-get') || code.includes('sudo ')) return 'bash';
    
    // Default fallback
    return 'plaintext';
  };

  const escapeHtml = (text) => {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  // Add a global function for copying code blocks
  useEffect(() => {
    // Add the copy function to the window object so it can be called from HTML
    window.copyCodeBlock = (blockId) => {
      const codeBlock = document.getElementById(blockId);
      if (!codeBlock) return;
      
      const codeElement = codeBlock.querySelector('code');
      if (!codeElement) return;
      
      const code = codeElement.innerText;
      const button = codeBlock.querySelector('.code-copy-btn');
      
      // Use the clipboard API to copy the text
        navigator.clipboard.writeText(code)
          .then(() => {
          // Visual feedback
          const originalText = button.textContent;
          button.textContent = 'Copied!';
          button.style.backgroundColor = 'rgba(40, 167, 69, 0.8)';
          
            setTimeout(() => {
            button.textContent = originalText;
            button.style.backgroundColor = '';
            }, 2000);
          })
          .catch(err => {
          console.error('Failed to copy: ', err);
          
          // Fallback method for older browsers
          const textarea = document.createElement('textarea');
          textarea.value = code;
          textarea.style.position = 'fixed';
          textarea.style.opacity = '0';
          document.body.appendChild(textarea);
          textarea.focus();
          textarea.select();
          
          try {
            const successful = document.execCommand('copy');
            
            if (successful) {
              const originalText = button.textContent;
              button.textContent = 'Copied!';
              button.style.backgroundColor = 'rgba(40, 167, 69, 0.8)';
              
            setTimeout(() => {
                button.textContent = originalText;
                button.style.backgroundColor = '';
            }, 2000);
            } else {
              button.textContent = 'Failed';
              button.style.backgroundColor = 'rgba(220, 53, 69, 0.8)';
              
              setTimeout(() => {
                button.textContent = 'Copy';
                button.style.backgroundColor = '';
              }, 2000);
            }
          } catch (err) {
            console.error('Fallback: Failed to copy', err);
            button.textContent = 'Failed';
          }
          
          document.body.removeChild(textarea);
        });
    };
    
    return () => {
      // Clean up
      delete window.copyCodeBlock;
    };
  }, []);

  // Add handlePaste function
  const handlePaste = (e) => {
    // Let the regular onChange event handle the paste content update
    setTimeout(() => {
      const value = e.target.value;
      const urls = extractUrls(value);
      if (urls.length > 0) {
        setInputUrls(urls);
        
        // Fetch previews for new URLs
        urls.forEach(url => {
          if (!linkPreviews[url] && !loadingPreviews[url]) {
            fetchLinkPreview(url);
          }
        });
      }
    }, 0);
  };

  // Fix back/forward cache issues
  useEffect(() => {
    // Remove any 'unload' listeners that might prevent bfcache
    const handlePageHide = () => {
      // Use pageHide instead of unload
      // Clean up operations can go here
    };
    
    window.addEventListener('pagehide', handlePageHide);
    
    // Ensure we don't use unload event
    window.removeEventListener('unload', () => {});
    
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, []);

  return (
    <div className="chat-window d-flex flex-column w-100 h-100 p-3">
      {loading ? (
        <div className="text-center mt-4">Loading chat...</div>
      ) : friendNotFound ? (
        <div className="text-center mt-4">
          <h3>User Not Found</h3>
          <p>Sorry, the user you're looking for doesn't exist or is not available.</p>
          <a href="/chat" className="btn btn-primary mt-3">Back to Friends List</a>
        </div>
      ) : (
        <>
          <div className="chat-header">
            <div className="d-flex align-items-center cursor-pointer" onClick={toggleFriendProfile}>
              <div className="avatar-circle">
                {friendName ? friendName.charAt(0).toUpperCase() : "?"}
              </div>
              <div className="friend-info">
                <h5 className="friend-name">{friendName || "Unknown"}</h5>
                <span className={`status-text ${onlineStatus ? 'text-success' : 'text-secondary'}`}>
                  {onlineStatus ? "Active now" : friendLastSeen ? formatLastSeen(friendLastSeen) : "Offline"}
                </span>
              </div>
            </div>
            <div className="header-actions">
              {!audioInitialized && (
                <button 
                  className="header-btn audio-init" 
                  title="Enable sound notifications"
                  onClick={() => {
                    playNotificationSound('message');
                    setAudioInitialized(true);
                  }}
                >
                  🔊
                </button>
              )}
              
              {Notification.permission !== 'granted' && (
                <button 
                  className="header-btn" 
                  title="Enable desktop notifications"
                  onClick={() => {
                    // Force a permission request with user interaction
                    Notification.requestPermission().then(permission => {
                      console.log("Notification permission:", permission);
                      setNotificationPermission(permission);
                      
                      // Show a test notification if permission granted
                      if (permission === 'granted') {
                        try {
                          const notification = new Notification("Notifications enabled", {
                            body: "You will now receive notifications for new messages",
                            icon: 'https://via.placeholder.com/192x192.png?text=LUXORA'
                          });
                          setTimeout(() => notification.close(), 3000);
                        } catch(e) {
                          console.error("Test notification failed:", e);
                        }
                      }
                    });
                  }}
                >
                  🔔
                </button>
              )}
              
              {!activeCall && !isAI ? (
                <>
                  <button className="header-btn" onClick={() => startCall(friendId, friendPeerId, friendName, "audio")} title="Start audio call">
                    <FaPhoneAlt />
                  </button>
                  <button className="header-btn" onClick={() => startCall(friendId, friendPeerId, friendName, "video")} title="Start video call">
                    <FaVideo />
                  </button>
                </>
              ) : activeCall ? (
                <button className="header-btn end-call" onClick={endCall}>
                  <FaPhoneSlash />
                </button>
              ) : null}
            </div>
          </div>

          <div className="encryption-indicator">
            <FaShieldAlt className="encryption-icon" />
            <span>End-to-end encrypted</span>
          </div>

          {/* Friend Profile Modal */}
          {showFriendProfile && (
            <div className="friend-profile-modal">
              <div className="friend-profile-content">
                <div className="friend-profile-header">
                  <button className="close-btn" onClick={toggleFriendProfile}>
                    <FaArrowLeft />
                  </button>
                  <h4>Contact Info</h4>
                </div>
                <div className="friend-profile-body">
                  <div className="friend-profile-avatar">
                    <div className="avatar-container">
                      <div className="avatar">
                        {friendName ? friendName.charAt(0).toUpperCase() : "?"}
                      </div>
                      <div className="avatar-change">
                        <FaCamera />
                      </div>
                    </div>
                    <h3 className="mt-3">{friendName}</h3>
                    <p className={`status ${onlineStatus ? 'online' : 'offline'}`}>
                      {onlineStatus ? "Online" : friendLastSeen ? formatLastSeen(friendLastSeen) : "Offline"}
                    </p>
                    <div className="action-buttons">
                      <button className="action-btn message" onClick={toggleFriendProfile}>
                        <span className="action-icon">💬</span>
                        <span>Message</span>
                      </button>
                      {!isAI && (
                        <>
                      <button className="action-btn call" onClick={() => startCall(friendId, friendPeerId, friendName, "audio")}>
                        <span className="action-icon">📞</span>
                        <span>Call</span>
                      </button>
                      <button className="action-btn video" onClick={() => startCall(friendId, friendPeerId, friendName, "video")}>
                        <span className="action-icon">📹</span>
                        <span>Video</span>
                      </button>
                        </>
                      )}
                    </div>
                  </div>
                  
                  <div className="friend-info-section">
                    {isAI ? (
                      <>
                        <div className="info-item">
                          <div className="info-label">AI Assistant</div>
                          <div className="info-value">
                            This is an AI assistant that can help you with various tasks and answer your questions.
                          </div>
                        </div>
                        
                        <div className="info-item">
                          <div className="info-label">Capabilities</div>
                          <div className="info-value">
                            <ul className="ai-capabilities-list">
                              <li>Answering questions</li>
                              <li>Providing information</li>
                              <li>Helping with tasks</li>
                              <li>Engaging in conversation</li>
                            </ul>
                          </div>
                        </div>
                        
                        <div className="info-item">
                          <div className="info-label">Notifications</div>
                          <div className="notifications-row">
                            <div className="notifications-text">
                              {showNotifications ? 'Notifications are ON' : 'Notifications are OFF'}
                            </div>
                            <div className="toggle-switch" onClick={toggleNotifications}>
                              <input 
                                type="checkbox" 
                                id="notification-toggle" 
                                checked={showNotifications} 
                                onChange={toggleNotifications} 
                              />
                              <label htmlFor="notification-toggle"></label>
                            </div>
                          </div>
                          {showNotifications && notificationPermission !== 'granted' && (
                            <div className="notification-permission mt-2">
                              <p className="text-warning small mb-2">Browser notifications not enabled.</p>
                              <button
                                className="btn btn-sm btn-outline-primary" 
                                onClick={requestNotificationPermission}
                              >
                                Enable Browser Notifications
                              </button>
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                    <div className="info-item">
                      <div className="info-label">About</div>
                      <div className="info-value">Hey there! I'm using Luxora Chat.</div>
                    </div>
                    
                    <div className="info-item">
                      <div className="info-label">Email</div>
                      <div className="info-value">{friendName?.toLowerCase().replace(/\s+/g, '')}@example.com</div>
                    </div>
                    
                    <div className="info-item">
                      <div className="info-label">Media, Links and Docs</div>
                      <div className="info-value media-preview">
                        {sharedMedia.map((media, index) => (
                          <div className="media-item" key={index}>
                            {media && media.url && (
                              <img 
                                src={media.url} 
                                alt="Shared media" 
                                onError={(e) => {
                                  console.warn("Failed to load image:", media.url);
                                  e.target.style.display = 'none';
                                }}
                              />
                            )}
                            <div className="media-date">{media?.date || ''}</div>
                          </div>
                        ))}
                      </div>
                      <div className="view-all">
                        See all
                      </div>
                    </div>
                    
                    <div className="info-item">
                      <div className="info-label">Notifications</div>
                      <div className="notifications-row">
                        <div className="notifications-text">
                          {showNotifications ? 'Notifications are ON' : 'Notifications are OFF'}
                        </div>
                        <div className="toggle-switch" onClick={toggleNotifications}>
                          <input 
                            type="checkbox" 
                            id="notification-toggle" 
                            checked={showNotifications} 
                            onChange={toggleNotifications} 
                          />
                          <label htmlFor="notification-toggle"></label>
                        </div>
                      </div>
                      {showNotifications && notificationPermission !== 'granted' && (
                        <div className="notification-permission mt-2">
                          <p className="text-warning small mb-2">Browser notifications not enabled.</p>
                          <button
                            className="btn btn-sm btn-outline-primary" 
                            onClick={requestNotificationPermission}
                          >
                            Enable Browser Notifications
                          </button>
                        </div>
                      )}
                    </div>
                    
                    <div className="info-item danger-zone">
                      <div className="danger-action" onClick={handleBlock}>
                        <FaShieldAlt className="danger-icon" /> Block {friendName}
                      </div>
                      <div className="danger-action" onClick={handleReport}>
                        <FaFlag className="danger-icon" /> Report {friendName}
                      </div>
                    </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

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
              (() => {
                // Group messages by date
                const messagesByDate = {};
                
                // Process messages
                messages.forEach(msg => {
                  const timestamp = msg.timestamp || msg.createdAt || new Date().toISOString();
                  const dateKey = formatMessageDate(timestamp);
                  
                  if (!messagesByDate[dateKey]) {
                    messagesByDate[dateKey] = [];
                  }
                  messagesByDate[dateKey].push(msg);
                });
                
                // Render messages grouped by date
                return Object.entries(messagesByDate).map(([dateKey, groupMessages]) => (
                  <div key={dateKey} className="message-group">
                    <div className="date-separator text-center my-2">
                      <span className="date-badge">{dateKey}</span>
                </div>
                    
                    {groupMessages.map((msg, index) => {
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
                      const isEmojiOnly = isEmojiOnlyMessage(messageContent);
                      
                      return (
                        <div key={index} className={`d-flex mb-2 ${isSentByMe ? "justify-content-end" : "justify-content-start"}`}>
                          <div style={{maxWidth: "70%"}}>
                            <div className={`message-bubble ${isSentByMe ? "sent" : "received"} ${!isSentByMe && isAI ? "ai-message" : ""}`} id={`message-${msg.id || index}`}>
                              {/* Display message text */}
                              <div 
                                className={`message-content ${isEmojiOnlyMessage(messageContent) ? 'emoji-message' : ''}`}
                                dangerouslySetInnerHTML={{ __html: formatMessageWithCodeBlocks(messageContent || '') }}
                              ></div>
                              {msg.edited && <span className="edited-indicator"> (edited)</span>}
                              
                              {/* Link Previews */}
                              {extractUrls(messageContent).map((url, urlIndex) => (
                                <LinkPreview 
                                  key={`${msg.id || index}-url-${urlIndex}`}
                                  url={url}
                                  preview={linkPreviews[url]}
                                  isLoading={!!loadingPreviews[url]}
                                />
                              ))}

                              {/* Three dots options */}
                              {(msg.senderId === userId || msg.receiverId === userId) && (
                                <div className="message-options">
                                  <button className="btn" onClick={() => handleMessageOptions(msg.id || index)}>
                                    <FaEllipsisV />
                                  </button>
                                  {activeMessageId === (msg.id || index) && (
                                    <div className="message-options-menu">
                                      <div className="message-option-item">Forward</div>
                                      <div className="message-option-item">Reply</div>
                                      {isSentByMe ? (
                                        <>
                                          <div className="message-option-item" onClick={() => handleEditMessage(msg.id || index, messageContent)}>Edit</div>
                                          <div className="message-option-item delete">Delete</div>
                                        </>
                                      ) : (
                                        <div className="message-option-item">Report</div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="message-timestamp">
                              {formatTime(msg.timestamp)}
                              {isSentByMe && (
                                <span className="message-status ms-1">
                                  {msg.status === "sending" && <span title="Sent">✓</span>}
                                  {msg.status === "sent" && <span title="Sent">✓</span>}
                                  {msg.status === "delivered" && <span title="Delivered">✓✓</span>}
                                  {msg.status === "read" && <span title="Read" className="text-primary">✓✓</span>}
                                  {msg.status === "failed" && <span title="Failed to send" className="text-danger">!</span>}
                                </span>
                              )}
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
                No messages yet. Start the conversation!
              </div>
            )}
            
            {/* Friend Typing Indicator */}
            {isTyping && (
              <div className="d-flex mb-2 justify-content-start">
                <div style={{maxWidth: "70%"}}>
                  <div className="typing-indicator">
                    <span className="dot"></span>
                    <span className="dot"></span>
                    <span className="dot"></span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Chat Input + Send Button */}
          <div className="chat-footer d-flex p-2 border-top">
            {/* Emoji button with container */}
            <div className="position-relative">
              <button 
                className="emoji-btn" 
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                title="Add emoji"
                aria-label="Add emoji"
              >
                <FaSmile />
              </button>
              
              {/* Emoji Picker */}
              {showEmojiPicker && (
                <div className="emoji-picker-container" ref={emojiPickerRef}>
                  <Picker 
                    data={data} 
                    onEmojiSelect={handleEmojiSelect}
                    theme="light"
                    previewPosition="none"
                    skinTonePosition="none"
                  />
                </div>
              )}
            </div>
            
            <div className="position-relative d-flex flex-grow-1">
              {editingMessageId && (
                <div className="edit-indicator">
                  <span>Editing message</span>
                  <button className="cancel-edit-btn" onClick={() => {
                    setEditingMessageId(null);
                    setEditMessageText("");
                    setInput("");
                  }}>×</button>
                </div>
              )}
              
              <input
                type="text"
                placeholder={editingMessageId ? "Edit message..." : "Type a message..."}
                value={input}
                onChange={handleInputChange}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                onPaste={handlePaste}
                className={`form-control ${editingMessageId ? 'editing' : ''}`}
              />
              
              {/* Input URL Previews */}
              {inputUrls.length > 0 && (
                <div className="input-preview-container">
                  {inputUrls.map((url, index) => (
                    <LinkPreview 
                      key={`input-url-${index}`}
                      url={url}
                      preview={linkPreviews[url]}
                      isLoading={!!loadingPreviews[url]}
                    />
                  ))}
                </div>
              )}
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