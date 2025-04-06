/**
 * Call Helper Utility
 * 
 * Provides reliable methods for managing calls across browser tabs and socket connections
 */

import { getUser } from './authHelper';

// Create a broadcast channel to communicate between tabs
let callChannel;
try {
  callChannel = new BroadcastChannel("call_notification_channel");
  console.log("BroadcastChannel initialized successfully");
} catch (e) {
  console.warn("BroadcastChannel not supported in this browser, falling back to local storage polling:", e);
  callChannel = null;
}

// Use both localStorage and sessionStorage for maximum reliability
// Save an outgoing call to storage for maximum reliability
export const saveOutgoingCall = (callData) => {
  try {
    if (!callData) return false;
    
    // Add timestamp if not present
    if (!callData.timestamp) {
      callData.timestamp = Date.now();
    }
    
    localStorage.setItem('outgoingCall', JSON.stringify(callData));
    
    // Also save to sessionStorage for cross-tab persistence
    sessionStorage.setItem('callData', JSON.stringify(callData));
    
    // Broadcast to other tabs
    try {
      const broadcastChannel = new BroadcastChannel('call_channel');
      broadcastChannel.postMessage({
        type: 'outgoingCall',
        data: callData
      });
      broadcastChannel.close();
    } catch (e) {
      console.log("BroadcastChannel not supported", e);
    }
    
    // Try direct server notification for maximum reliability
    notifyServerOfCall({
      ...callData,
      type: 'outgoing'
    });
    
    console.log("📱 Outgoing call saved:", callData);
    return true;
  } catch (error) {
    console.error("Error saving outgoing call:", error);
    return false;
  }
};

// Save an incoming call to storage for maximum reliability
export const saveIncomingCall = (callData) => {
  try {
    if (!callData) return false;
    
    // Add timestamp if not present
    if (!callData.timestamp) {
      callData.timestamp = Date.now();
    }
    
    // Save to localStorage
    localStorage.setItem('incomingCall', JSON.stringify(callData));
    
    // Play sound if this is a new call or call was previously saved but not rejected
    // Only if this is a new incoming call (not a refresh of existing incoming call)
    const existingCall = localStorage.getItem('incomingCall');
    const existingCallData = existingCall ? JSON.parse(existingCall) : null;
    
    // Play sound if no existing call OR if the caller ID is different
    if (!existingCallData || existingCallData.callerId !== callData.callerId) {
      playCallSound();
    }
    
    console.log("📱 Incoming call saved:", callData);
    return true;
  } catch (error) {
    console.error("Error saving incoming call:", error);
    return false;
  }
};

// Get any active incoming call from storage
export const getIncomingCall = () => {
  try {
    const incomingCallStr = localStorage.getItem('incomingCall');
    if (!incomingCallStr) return null;
    
    const incomingCall = JSON.parse(incomingCallStr);
    
    // Check if call has expired
    if (incomingCall.expiry && incomingCall.expiry < Date.now()) {
      // Call expired, remove it
      localStorage.removeItem('incomingCall');
      return null;
    }
    
    return incomingCall;
  } catch (e) {
    console.error("Failed to get incoming call from storage:", e);
    return null;
  }
};

// Get any active outgoing call from storage
export const getOutgoingCall = () => {
  try {
    // First try localStorage
    const outgoingCallStr = localStorage.getItem('outgoingCall');
    if (outgoingCallStr) {
      const outgoingCall = JSON.parse(outgoingCallStr);
      
      // Check if call has expired
      if (outgoingCall.expiry && outgoingCall.expiry < Date.now()) {
        // Call expired, remove it
        localStorage.removeItem('outgoingCall');
        sessionStorage.removeItem('callData');
        return null;
      }
      
      return outgoingCall;
    }
    
    // Then try sessionStorage as fallback
    const sessionCallDataStr = sessionStorage.getItem('callData');
    if (sessionCallDataStr) {
      const sessionCallData = JSON.parse(sessionCallDataStr);
      
      // Check if it's valid and not expired
      if (sessionCallData && (!sessionCallData.expiry || sessionCallData.expiry > Date.now())) {
        return sessionCallData;
      } else if (sessionCallData && sessionCallData.expiry < Date.now()) {
        // Expired, clean up
        sessionStorage.removeItem('callData');
      }
    }
    
    return null;
  } catch (e) {
    console.error("Failed to get outgoing call from storage:", e);
    return null;
  }
};

// Clear any incoming call data
export const clearIncomingCall = () => {
  try {
    localStorage.removeItem('incomingCall');
    console.log("📞 Cleared incoming call from storage");
    
    // Also broadcast that the call was cleared
    if (callChannel) {
      callChannel.postMessage({
        type: "clear_incoming_call",
        timestamp: Date.now()
      });
    }
    
    return true;
  } catch (e) {
    console.error("Failed to clear incoming call from storage:", e);
    return false;
  }
};

// Clear any outgoing call data
export const clearOutgoingCall = () => {
  try {
    localStorage.removeItem('outgoingCall');
    sessionStorage.removeItem('callData');
    console.log("📞 Cleared outgoing call from storage");
    return true;
  } catch (e) {
    console.error("Failed to clear outgoing call from storage:", e);
    return false;
  }
};

// Export a function to check if a call can be established with the given user
export const canEstablishCall = async (friendId) => {
  try {
    // Try to send a ping via socket to check availability
    if (window.socket) {
      window.socket.emit("pingUser", {
        targetId: friendId,
        senderId: getUser()?.id
      });
      
      // Return a promise that resolves when we get a response or times out
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          window.removeEventListener("userPingResponse", handler);
          resolve(false); // No response, assume user is unreachable
        }, 3000);
        
        const handler = (event) => {
          if (event.detail.userId === friendId) {
            clearTimeout(timeout);
            window.removeEventListener("userPingResponse", handler);
            resolve(event.detail.available);
          }
        };
        
        window.addEventListener("userPingResponse", handler);
      });
    }
    return true; // Default to true if socket isn't available
  } catch (err) {
    console.error("Error checking call availability:", err);
    return true; // Default to true if check fails
  }
};

// Helper method to broadcast calls directly to backend
export const notifyServerOfCall = (callData) => {
  try {
    const xhr = new XMLHttpRequest();
    const apiUrl = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000/api';
    xhr.open('POST', `${apiUrl}/calls/notify`, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    
    // Add auth token if available
    const token = localStorage.getItem('token');
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }
    
    xhr.send(JSON.stringify(callData));
    return true;
  } catch (error) {
    console.error("Failed to notify server about call:", error);
    return false;
  }
};

// Play call sound loudly to ensure notification
export const playCallSound = () => {
  try {
    // Only create the audio element if it doesn't exist
    if (!window.callSound) {
      window.callSound = new Audio();
      window.callSound.src = "https://cdn.pixabay.com/download/audio/2021/08/04/audio_0625c1539c.mp3?filename=ringtone-126515.mp3";
      window.callSound.loop = true;
      window.callSound.volume = 1.0;
    }
    
    window.callSound.play().catch(err => console.error("Error playing call sound:", err));
    
    // Fallback to browser notification
    if (Notification.permission === "granted") {
      const notification = new Notification("Incoming Call", {
        body: "Someone is calling you!",
        icon: "/favicon.ico"
      });
      
      notification.onclick = function() {
        window.focus();
        this.close();
      };
    }
    
    return true;
  } catch (error) {
    console.error("Error playing call sound:", error);
    return false;
  }
};

// Stop call sound
export const stopCallSound = () => {
  if (window.callSound) {
    window.callSound.pause();
    window.callSound.currentTime = 0;
  }
};

// Listen for call notifications from other tabs
if (callChannel) {
  callChannel.onmessage = (event) => {
    console.log("📞 Received call channel message:", event.data);
    
    if (event.data.type === "incoming_call") {
      // Try to re-render the incoming call UI in this tab
      console.log("📞 Received call notification from another tab:", event.data);
      
      // Store in localStorage (note: we don't use saveIncomingCall to avoid an infinite loop)
      try {
        localStorage.setItem('incomingCall', JSON.stringify({
          ...event.data.callData,
          timestamp: Date.now(),
          expiry: Date.now() + 60000 // 1 minute expiry
        }));
      } catch (e) {
        console.error("Failed to save shared incoming call to localStorage:", e);
      }
      
      // Dispatch a custom event that components can listen for
      window.dispatchEvent(new CustomEvent("incomingCall", { 
        detail: event.data.callData 
      }));
      
      // Try to play a sound
      playCallSound();
    }
    else if (event.data.type === "clear_incoming_call") {
      // Clear this tab's incoming call data
      localStorage.removeItem('incomingCall');
      
      // Notify UI
      window.dispatchEvent(new CustomEvent("callCleared"));
    }
  };
}

// Broadcast an incoming call to all tabs
export const broadcastIncomingCall = (callData) => {
  try {
    // Use BroadcastChannel API if available
    if (typeof BroadcastChannel !== 'undefined') {
      const broadcastChannel = new BroadcastChannel('call_channel');
      broadcastChannel.postMessage({
        type: 'incomingCall',
        data: callData
      });
      broadcastChannel.close();
    }
    
    // Fallback: also use CustomEvent for additional reliability
    const event = new CustomEvent('incomingCall', { detail: callData });
    window.dispatchEvent(event);
    
    return true;
  } catch (error) {
    console.error("Error broadcasting incoming call:", error);
    
    // Fallback to direct event dispatch
    try {
      const event = new CustomEvent('incomingCall', { detail: callData });
      window.dispatchEvent(event);
    } catch (e) {
      console.error("Even fallback event dispatch failed:", e);
    }
    
    return false;
  }
};

// Extra helper to get call data from any available source
export const getCallData = () => {
  try {
    // First try sessionStorage (most reliable during a call)
    const sessionCallData = sessionStorage.getItem('callData');
    if (sessionCallData) {
      return JSON.parse(sessionCallData);
    }
    
    // Then check outgoing calls
    const outgoingCall = getOutgoingCall();
    if (outgoingCall) {
      return outgoingCall;
    }
    
    // Finally check incoming calls
    const incomingCall = getIncomingCall();
    if (incomingCall) {
      return {
        friendId: incomingCall.callerId,
        friendName: incomingCall.callerName,
        friendPeerId: incomingCall.callerPeerId,
        callType: incomingCall.callType,
        isInitiator: false
      };
    }
    
    return null;
  } catch (e) {
    console.error("Error getting call data:", e);
    return null;
  }
};

// Listen for localStorage events (fallback for BroadcastChannel)
if (!callChannel) {
  window.addEventListener('storage', (event) => {
    if (event.key === 'callBroadcast' && event.newValue) {
      try {
        const data = JSON.parse(event.newValue);
        console.log("📞 Received call broadcast via localStorage event:", data);
        
        if (data.type === "incoming_call" && data.callData) {
          // Store the call data
          localStorage.setItem('incomingCall', JSON.stringify({
            ...data.callData,
            timestamp: Date.now(),
            expiry: Date.now() + 60000 // 1 minute expiry
          }));
          
          // Dispatch a custom event
          window.dispatchEvent(new CustomEvent("incomingCall", {
            detail: data.callData
          }));
          
          // Try to play a sound
          playCallSound();
        }
      } catch (e) {
        console.error("Error processing localStorage call broadcast:", e);
      }
    }
  });
}

// Export all functions to make call handling more reliable
const callHelper = {
  saveOutgoingCall,
  saveIncomingCall,
  getIncomingCall,
  getOutgoingCall,
  clearIncomingCall,
  clearOutgoingCall,
  playCallSound,
  broadcastIncomingCall,
  getCallData
};

// Export all functions to make call handling more reliable
export default callHelper; 