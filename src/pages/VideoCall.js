import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams, useLocation } from 'react-router-dom';
// import VideoCallComponent from '../components/VideoCall';
import { io } from "socket.io-client";
import { getUser } from "../utils/authHelper";
import Peer from "peerjs";
import * as callHelper from "../utils/callHelper"; // Import call helper utilities

// Add CSS for improved video call UI
const videoCallStyles = {
  container: {
    position: 'relative',
    width: '100vw',
    height: '100vh',
    backgroundColor: '#1a1a1a',
    overflow: 'hidden',
    color: '#fff',
    fontFamily: 'Segoe UI, Roboto, Arial, sans-serif',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '60px',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    padding: '0 20px',
    zIndex: 10,
    justifyContent: 'space-between',
    backdropFilter: 'blur(10px)',
  },
  logo: {
    fontWeight: 'bold',
    fontSize: '1.2rem',
  },
  callInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  callType: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: '5px 10px',
    borderRadius: '15px',
    fontSize: '0.9rem',
  },
  callTimer: {
    fontSize: '0.9rem',
  },
  videoContainer: {
    position: 'relative',
    width: '100%',
    height: '100%',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  remoteVideo: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    position: 'absolute',
    zIndex: 1,
  },
  localVideoContainer: {
    position: 'absolute',
    width: '180px',
    height: '120px',
    bottom: '100px',
    right: '20px',
    borderRadius: '8px',
    overflow: 'hidden',
    border: '2px solid #fff',
    zIndex: 3,
    boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)',
    transition: 'all 0.3s ease',
  },
  localVideo: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  controls: {
    position: 'absolute',
    bottom: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: '15px',
    zIndex: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    backdropFilter: 'blur(15px)',
    padding: '10px 20px',
    borderRadius: '50px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
  },
  controlButton: {
    width: '50px',
    height: '50px',
    borderRadius: '50%',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    color: 'white',
    cursor: 'pointer',
    border: 'none',
    transition: 'all 0.2s ease',
  },
  endCallButton: {
    backgroundColor: '#e74c3c',
  },
  statusMessage: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: '15px 25px',
    borderRadius: '8px',
    fontSize: '1.1rem',
    zIndex: 20,
    maxWidth: '80%',
    textAlign: 'center',
  },
  errorMessage: {
    position: 'absolute',
    bottom: '80px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: 'rgba(231, 76, 60, 0.9)',
    color: 'white',
    padding: '10px 20px',
    borderRadius: '4px',
    fontSize: '0.9rem',
    zIndex: 100,
    maxWidth: '80%',
    textAlign: 'center',
  },
  reconnectButton: {
    backgroundColor: '#3498db',
    color: 'white',
    border: 'none',
    padding: '8px 15px',
    borderRadius: '4px',
    marginTop: '10px',
    cursor: 'pointer',
  },
  debugInfo: {
    position: 'absolute',
    top: '70px',
    right: '10px',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    padding: '10px',
    borderRadius: '4px',
    fontSize: '0.8rem',
    maxWidth: '300px',
    zIndex: 100,
  },
};

const VideoCall = () => {
  const { friendSlug } = useParams();
  const location = useLocation();
  
  // States
  const [callData, setCallData] = useState(null);
  const [callClosed, setCallClosed] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  // remoteStream is used indirectly in callData updates within setupPeerConnection
  // eslint-disable-next-line no-unused-vars
  const [remoteStream, setRemoteStream] = useState(null);
  const [error, setError] = useState(null);
  const [debugInfo, setDebugInfo] = useState(null); // For debugging
  const [audioEnabled, setAudioEnabled] = useState(true); // Add state for audio
  const [videoEnabled, setVideoEnabled] = useState(true); // Add state for video
  const [connectionStatus, setConnectionStatus] = useState('connecting'); // Add connection status state
  
  // Refs
  const peerRef = useRef(null);
  const connectionAttemptRef = useRef(0);
  const socketRef = useRef(null);
  const localVideoRef = useRef(null); // Add ref for local video
  const remoteVideoRef = useRef(null); // Add ref for remote video
  
  const userId = getUser()?.id;
  const socketUrl = process.env.REACT_APP_SOCKET_URL || "http://localhost:5000";

  // Get callType from URL params using useMemo to prevent dependency changes on every render
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const callType = useMemo(() => searchParams.get('callType') || 'video', [searchParams]); // Default to video if not specified
  // eslint-disable-next-line no-unused-vars
  const friendName = useMemo(() => searchParams.get('friendName') || 'Friend', [searchParams]);

  // Debug function to check all possible storage locations
  const checkCallStorage = useCallback(() => {
    try {
      const debug = {
        sessionStorage: null,
        localStorage_outgoing: null,
        localStorage_incoming: null,
        callHelper_data: null,
        callHelper_outgoing: null,
        callHelper_incoming: null,
        timestamp: new Date().toISOString()
      };
      
      // Check sessionStorage
      try {
        const sessionData = sessionStorage.getItem('callData');
        debug.sessionStorage = sessionData ? JSON.parse(sessionData) : null;
      } catch (e) {
        debug.sessionStorage = `Error: ${e.message}`;
      }
      
      // Check localStorage
      try {
        const outgoingCall = localStorage.getItem('outgoingCall');
        debug.localStorage_outgoing = outgoingCall ? JSON.parse(outgoingCall) : null;
      } catch (e) {
        debug.localStorage_outgoing = `Error: ${e.message}`;
      }
      
      try {
        const incomingCall = localStorage.getItem('incomingCall');
        debug.localStorage_incoming = incomingCall ? JSON.parse(incomingCall) : null;
      } catch (e) {
        debug.localStorage_incoming = `Error: ${e.message}`;
      }
      
      // Check callHelper functions
      try {
        debug.callHelper_data = callHelper.getCallData();
      } catch (e) {
        debug.callHelper_data = `Error: ${e.message}`;
      }
      
      try {
        debug.callHelper_outgoing = callHelper.getOutgoingCall();
      } catch (e) {
        debug.callHelper_outgoing = `Error: ${e.message}`;
      }
      
      try {
        debug.callHelper_incoming = callHelper.getIncomingCall();
      } catch (e) {
        debug.callHelper_incoming = `Error: ${e.message}`;
      }
      
      setDebugInfo(debug);
      return debug;
    } catch (e) {
      console.error("Error in checkCallStorage:", e);
      return null;
    }
  }, []);

  // Run storage check once on mount
  useEffect(() => {
    checkCallStorage();
  }, [checkCallStorage]);
  
  // Helper: End call and return to chat
  const handleEndCall = useCallback(() => {
    console.log("Call ending, navigating back to chat");
    
    // Mark call as closed first to prevent cleanup in unmount function
    setCallClosed(true);
    
    // Clean up the media streams
    if (localStream) {
      console.log("Stopping local stream tracks");
      localStream.getTracks().forEach(track => track.stop());
    }
    
    // Close peer connection - handle both PeerJS and direct WebRTC
    if (peerRef.current) {
      console.log("Destroying peer connection");
      if (peerRef.current instanceof RTCPeerConnection) {
        try {
          peerRef.current.close();
        } catch (e) {
          console.error("Error closing RTCPeerConnection:", e);
        }
      } else {
        // Assume it's a PeerJS instance
        try {
      peerRef.current.destroy();
        } catch (e) {
          console.error("Error destroying PeerJS connection:", e);
        }
      }
    }
    
    // Clear any stored call data
    callHelper.clearOutgoingCall();
    callHelper.clearIncomingCall();
    
    // Notify peer if socket is available
    if (socketRef.current && callData) {
      socketRef.current.emit("callEnded", {
        callerId: userId,
        friendId: callData.friendId || callData.targetId
      });
    }
    
    // Navigate back to chat
    window.location.href = `/chat/${friendSlug}`;
  }, [friendSlug, localStream, callData, userId]);
  
  // Function to set up the peer connection
  const setupPeerConnection = useCallback(async (storedData, userMediaStream) => {
    try {
      const attemptCount = connectionAttemptRef.current + 1;
      connectionAttemptRef.current = attemptCount;
      
      console.log(`Setting up peer connection - attempt ${attemptCount}`);
      setConnectionStatus('connecting');
      
      // Create a new Peer with a random ID to avoid collision
      const randomId = `peer_${userId}_${Math.floor(Math.random() * 1000000)}`;
      
      // Use a more reliable configuration that works across networks
      let peerConfig = {
        // Use direct WebRTC connection with reliable STUN/TURN servers
        config: {
          'iceServers': [
            // Multiple STUN servers for better connectivity
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
            // Free reliable TURN servers
            {
              urls: [
                'turn:openrelay.metered.ca:80',
                'turn:openrelay.metered.ca:443',
                'turn:openrelay.metered.ca:443?transport=tcp',
                'turn:openrelay.metered.ca:80?transport=tcp'
              ],
              username: 'openrelayproject',
              credential: 'openrelayproject'
            },
            // Additional TURN options to increase reliability
            {
              urls: 'turn:numb.viagenie.ca',
              credential: 'muazkh',
              username: 'webrtc@live.com'
            },
            {
              urls: 'turn:relay.metered.ca:80',
              username: 'e8dd65f92c6c98a96aa6c99f',
              credential: 'uBp3+Jz3ifJe8b/E'
            }
          ],
          'sdpSemantics': 'unified-plan',
          'iceCandidatePoolSize': 10
        },
        // Customize PeerJS to avoid connection issues
        // Use a less congested server
            host: 'peerjs-server.herokuapp.com', 
            secure: true,
            port: 443,
        path: '/',
        // Set debug level
            debug: 3,
        // Increase connection timeout
        pingInterval: 3000,
        // Set a custom retry timeout
        retryDelay: 1000
      };
      
      // If we're in a retry and getting the same error, bypass PeerJS's server completely
      if (attemptCount > 2) {
        console.log(`Switching to pure WebRTC approach on attempt ${attemptCount}`);
        
        // Signal through our existing socket.io connection instead of PeerJS server
        // Initialize the RTCPeerConnection directly
        return setupDirectWebRTC(storedData, userMediaStream, randomId);
      }
      
      console.log(`Creating peer with ID: ${randomId}`);
      const peer = new Peer(randomId, peerConfig);
      
      peerRef.current = peer;
      
      // Log PeerJS configuration for debugging
      console.log('PeerJS configuration:', peer._options);
      
      // Signal channel setup through socket.io
      const socket = io(socketUrl);
      socketRef.current = socket;
      
      // Log connection status for debugging
      socket.on('connect', () => {
        console.log(`Socket connected successfully with ID: ${socket.id}`);
        
        // When we connect, immediately identify ourselves
        socket.emit("userId", userId);
        
        // Announce that we're in a call
        socket.emit("inCall", {
          userId,
          friendId: storedData?.friendId,
          callType,
          peerId: randomId
        });
        
        console.log("Sent userId and inCall events to socket");
      });
      
      // Handle socket errors better
      socket.on('connect_error', (err) => {
        console.error(`Socket connection error: ${err.message}`);
        setError(`Socket connection error: ${err.message}. Retrying...`);
      
        // Try to reconnect socket after a delay
        setTimeout(() => {
          if (socket) {
            console.log("Attempting to reconnect socket...");
            socket.connect();
          }
        }, 2000);
      });
      
      // More reliable reconnection for socket
      socket.on('disconnect', () => {
        console.log("Socket disconnected. Will automatically try to reconnect.");
        setConnectionStatus('disconnected');
      });
      
      // Immediately identify when socket connects or reconnects
      socket.on('connect', () => {
      socket.emit("userId", userId);
        console.log("Socket connected/reconnected, sent userId:", userId);
      
        // Also re-announce call status on reconnect
        socket.emit("inCall", {
          userId,
          friendId: storedData?.friendId,
          callType,
          peerId: randomId
        });
      });
      
      // Listen for incoming calls to support mid-call joins
      socket.on("incomingCall", (data) => {
        console.log("Received incomingCall event in VideoCall component:", data);
        
        // If this call is meant for us and matches our current call, use the peer ID
        if (data.friendId === userId && storedData?.friendId === data.callerId) {
          console.log("This is a call relevant to our current session, updating peer info");
          
          // Update caller peer ID if needed
          if (data.callerPeerId && (!storedData.friendPeerId || storedData.friendPeerId !== data.callerPeerId)) {
            console.log(`Updating friend's peer ID from ${storedData.friendPeerId} to ${data.callerPeerId}`);
            storedData.friendPeerId = data.callerPeerId;
            
            // Update session storage
            sessionStorage.setItem('callData', JSON.stringify(storedData));
          }
          
          // Check if this is a direct WebRTC connection request
          if (data.directRTC && data.connectionId) {
            console.log("This is a direct WebRTC call, switching to direct mode");
            // Initialize direct WebRTC connection as receiver
            setupDirectWebRTC(storedData, userMediaStream, data.connectionId);
          }
        }
      });
      
      // Handle direct WebRTC ready signals
      socket.on("rtc-ready", (data) => {
        console.log("Received rtc-ready event:", data);
        
        // If this signal is for us and is from our current call friend
        if (data.targetId === userId && storedData?.friendId === data.userId) {
          console.log("Friend is ready for direct WebRTC connection");
          
          // If we're in direct WebRTC mode, try to initiate the connection
          if (peerRef.current instanceof RTCPeerConnection) {
            console.log("We're already in direct WebRTC mode, sending offer");
            
            // Create offer
            (async () => {
              try {
                // Create data channel (needed to start ICE gathering)
                peerRef.current.createDataChannel('call-setup');
                
                // Create offer
                const offer = await peerRef.current.createOffer({
                  offerToReceiveAudio: true,
                  offerToReceiveVideo: callType === 'video',
                });
                
                await peerRef.current.setLocalDescription(offer);
                
                // Send offer
                socket.emit('rtc-signal', {
                  type: 'offer',
                  offer,
                  senderId: userId,
                  targetId: data.userId,
                  connectionId: data.connectionId,
                  callType
                });
              } catch (err) {
                console.error("Error creating WebRTC offer:", err);
              }
            })();
          } else if (peerRef.current) {
            // We're still using PeerJS but should switch to direct
            console.log("Friend is using direct WebRTC but we're still on PeerJS, switching...");
            
            // Switch to direct WebRTC
            try {
              peerRef.current.destroy();
            } catch (e) {}
            
            setupDirectWebRTC(storedData, userMediaStream, data.connectionId);
          }
        }
      });
      
      // Add socket event handler for direct WebRTC fallback
      socket.on('fallback-to-direct', (data) => {
        if (data.targetId === userId) {
          console.log("Server requested fallback to direct WebRTC");
          
          // If we're already in direct mode, ignore
          if (peerRef.current instanceof RTCPeerConnection) {
            console.log("Already in direct WebRTC mode, ignoring fallback request");
            return;
          }
          
          // Switch to direct WebRTC
          try {
            if (peerRef.current) peerRef.current.destroy();
          } catch (e) {}
          
          setupDirectWebRTC(storedData, userMediaStream, data.connectionId || `fallback_${userId}_${Date.now()}`);
        }
      });
      
      // Handle forced call signals (last resort)
      socket.on("forceCallSignal", (data) => {
        console.log("Received forced call signal:", data);
        
        if (data.peerId && peer && userMediaStream && !connectionEstablished) {
          console.log("Attempting forced connection to peer:", data.peerId);
          
          try {
            const call = peer.call(data.peerId, userMediaStream);
            
            call.on('stream', (incomingStream) => {
              console.log('Received remote stream via forced signal');
              connectionEstablished = true;
              setRemoteStream(incomingStream);
              
              setCallData(prev => ({
                ...prev,
                remoteStream: incomingStream,
                callInstance: call
              }));
            });
          } catch (err) {
            console.error("Error establishing forced connection:", err);
          }
        }
      });
      
      // Handle reconnection signals for improved reliability
      socket.on("peerReconnect", (data) => {
        console.log("Received peer reconnect signal:", data);
        
        if (data.peerId && peer && userMediaStream) {
          console.log("Attempting reconnection to peer:", data.peerId);
          
          try {
            const call = peer.call(data.peerId, userMediaStream);
            
            call.on('stream', (incomingStream) => {
              console.log('Received remote stream after reconnection');
              connectionEstablished = true;
              setRemoteStream(incomingStream);
              
              setCallData(prev => ({
                ...prev,
                remoteStream: incomingStream,
                callInstance: call
              }));
            });
          } catch (err) {
            console.error("Error during peer reconnection:", err);
          }
        }
      });
      
      // Flag to track if we've established a connection
      let connectionEstablished = false;
      
      // Immediately connect to ICE servers to establish connection
      peer.on('open', (id) => {
        console.log(`Local peer ID is: ${id}`);
        
        const isInitiator = storedData?.isInitiator === true;
        const friendPeerId = storedData?.friendPeerId;
        
        console.log(`Call type: ${callType}, Initiator: ${isInitiator}, Friend PeerID: ${friendPeerId}`);
        
        // IMPORTANT: Set up socket handler for custom signaling
        socket.on('peerSignal', (data) => {
          // Only process signals meant for us
          if (data.targetPeerId === id) {
            console.log('Received custom peer signal:', data.signal);
            
            if (data.signal.type === 'offer' && !isInitiator) {
              // We received an offer, so answer it
              console.log('Answering incoming call offer');
              const call = peer.call(data.senderPeerId, userMediaStream);
              
              call.on('stream', (incomingStream) => {
                console.log('Received remote stream after accepting offer');
                connectionEstablished = true;
                setRemoteStream(incomingStream);
                
                setCallData(prev => ({
                  ...prev,
                  remoteStream: incomingStream,
                  callInstance: call
                }));
              });
            }
            
            // For other signal types, the default PeerJS handlers will work
          }
        });
        
        // Share our peer ID with the friend through socket
        socket.emit('updatePeerId', {
          userId: userId,
          peerId: id,
          friendId: friendSlug
        });
        
        if (isInitiator && friendPeerId) {
          console.log(`Initiating call to peer ${friendPeerId}`);
          
          // First, emit a custom signal to alert the other peer
          socket.emit('peerSignal', {
            signal: { type: 'offer-prep' },
            senderPeerId: id,
            targetPeerId: friendPeerId
          });
          
          // Then make the actual call
          const call = peer.call(friendPeerId, userMediaStream);
          
          // Listen for their stream
          call.on('stream', (incomingStream) => {
            console.log('Received remote stream as initiator');
            connectionEstablished = true;
            setRemoteStream(incomingStream);
            
            setCallData(prev => ({
              ...prev,
              remoteStream: incomingStream,
              callInstance: call
            }));
          });
          
          call.on('close', () => {
            console.log('Call closed by peer');
            handleEndCall();
          });
          
          call.on('error', (err) => {
            console.error('Call error:', err);
            socket.emit('peerSignal', {
              signal: { type: 'error', message: err.message },
              senderPeerId: id,
              targetPeerId: friendPeerId
            });
            setError(`Call connection error: ${err.message}`);
          });
        } else if (!isInitiator) {
          // We're waiting for a call, let's notify the initiator of our peer ID
          console.log('Waiting for incoming call, sending our peer ID to initiator');
          
          const initiatorId = storedData?.friendId;
          if (initiatorId) {
            socket.emit('acceptCall', {
              callerId: initiatorId,
              accepterId: userId,
              accepterPeerId: id
            });
          }
          
          // Listen for incoming calls
          peer.on('call', (incomingCall) => {
            console.log('Received incoming call, answering automatically with options:', incomingCall.options);
            
            // Ensure metadata is properly set for this call
            const callOptions = {
              metadata: {
                callType: callType,
                userId: userId,
                userName: getUser()?.name || 'User',
                friendId: storedData.friendId,
                friendName: storedData.friendName
              },
              // Add proper audio settings
              sdpTransform: (sdp) => {
                // Force high audio quality
                return sdp.replace('useinbandfec=1', 'useinbandfec=1; stereo=1; maxaveragebitrate=510000');
              }
            };
            
            // Answer with audio settings
            incomingCall.answer(userMediaStream, callOptions);
            
            // Log metadata for debugging
            console.log('Call metadata:', incomingCall.metadata);
            
            // Enhanced error handling for stream events
            incomingCall.on('stream', (incomingStream) => {
              console.log('Received remote stream as receiver');
              console.log('Remote stream details:', {
                audioTracks: incomingStream.getAudioTracks().length,
                videoTracks: incomingStream.getVideoTracks().length
              });
              
              // Ensure all tracks are enabled
              incomingStream.getTracks().forEach(track => {
                track.enabled = true;
                console.log(`Enabled remote ${track.kind} track: ${track.id}`);
              });
              
              connectionEstablished = true;
              setRemoteStream(incomingStream);
              setConnectionStatus('connected');
              
              // Play a sound to indicate connection established
              try {
                const audio = new Audio('https://cdn.pixabay.com/download/audio/2022/03/10/audio_31840b5d00.mp3?filename=notification-sound-7062.mp3');
                audio.volume = 0.3;
                audio.play().catch(e => console.warn('Could not play connection sound:', e));
              } catch (e) {
                console.warn('Error playing connection sound:', e);
              }
              
              setCallData(prev => ({
                ...prev,
                remoteStream: incomingStream,
                callInstance: incomingCall
              }));
            });
            
            incomingCall.on('close', () => {
              console.log('Call closed by peer');
              handleEndCall();
            });
            
            incomingCall.on('error', (err) => {
              console.error('Call error:', err);
              setError(`Call connection error: ${err.message}`);
            });
          });
        } else {
          setError('Cannot establish call: missing peer information');
        }
        
        // Check if connection is established after a timeout
        setTimeout(() => {
          if (!connectionEstablished && !callClosed) {
            console.log(`No connection established after 10 seconds on attempt ${attemptCount}`);
            
            // Log detailed diagnostics to help troubleshoot
            console.log("Connection diagnostic info:", {
              userId,
              friendId: storedData?.friendId,
              peerId: randomId, 
              friendPeerId: storedData?.friendPeerId,
              socketConnected: socket?.connected,
              socketId: socket?.id,
              peerStatus: peer._lastServerId ? 'connected' : 'disconnected',
              iceServers: peerConfig.config.iceServers.length
            });
            
            if (attemptCount < 5) {
              // Retry with a different approach
              peer.destroy();
              socketRef.current?.disconnect();
              
              // Calculate retry delay - shorter for early attempts
              const retryDelay = Math.min(1000 * attemptCount, 3000);
              
              console.log(`Retrying with different configuration (attempt ${attemptCount + 1}) after ${retryDelay}ms delay`);
              setTimeout(() => {
                if (!callClosed) {
                  setupPeerConnection(storedData, userMediaStream);
                }
              }, retryDelay);
            } else {
              setError('Could not establish a connection after multiple attempts. This may be due to firewall restrictions or network issues.');
              
              // Add firewall bypass button for users
              setDebugInfo(prev => ({
                ...prev,
                isFirewallError: true
              }));
              
              // Try one last approach - ask the server to signal the user
              if (socket && socket.connected && storedData?.friendId) {
                socket.emit("forceCallSignal", {
                  callerId: userId,
                  receiverId: storedData.friendId,
                  callType: callType,
                  timestamp: Date.now(),
                  peerId: randomId
                });
                
                console.log("Sent forceCallSignal as last resort");
              }
            }
          }
        }, 10000);
      });
      
      // Handle peer error
      peer.on('error', (err) => {
        console.error('Peer connection error:', err);
        
        // Get current attempt count for this context
        const currentAttemptCount = connectionAttemptRef.current;
        
        // Notify via socket about the error to help debugging
        if (socket && socket.connected) {
          socket.emit('peerConnectionError', {
            userId,
            friendId: storedData?.friendId,
            error: err.type,
            message: err.message,
            peerId: randomId,
            attemptCount: currentAttemptCount
          });
        }
        
        let errorMessage;
        let shouldAutoRetry = false;
        
        // Check for specific "Lost connection to server" error
        const isLostConnectionError = 
          (err.message && err.message.includes('Lost connection')) ||
          (err.type === 'network') ||
          (err.type === 'disconnected') ||
          (err.type === 'socket-closed');
        
        if (isLostConnectionError) {
          errorMessage = 'Lost connection to call server. Automatically reconnecting...';
          setConnectionStatus('disconnected');
          shouldAutoRetry = true;
        } else {
          // Handle other error types with appropriate messages and actions
        switch (err.type) {
          case 'peer-unavailable':
            errorMessage = 'Your friend appears to be offline or unavailable.';
              setConnectionStatus('disconnected');
            break;
          case 'browser-incompatible':
            errorMessage = 'Your browser may not fully support video calls. Try using Chrome or Firefox.';
              setConnectionStatus('error');
            break;
          case 'network':
              errorMessage = 'Network connection issue. Reconnecting automatically...';
              setConnectionStatus('error');
              shouldAutoRetry = true;
            break;
          case 'disconnected':
              errorMessage = 'Connection lost. Reconnecting automatically...';
              setConnectionStatus('disconnected');
              shouldAutoRetry = true;
            break;
          case 'server-error':
            errorMessage = 'Server connection error. Trying alternative connection method...';
              setConnectionStatus('error');
              shouldAutoRetry = true;
            break;
          case 'socket-error':
            errorMessage = 'Signaling server issue. Trying alternative connection approach...';
              setConnectionStatus('error');
              shouldAutoRetry = true;
            break;
          case 'socket-closed':
              errorMessage = 'Signaling connection closed. Trying with backup servers...';
              setConnectionStatus('disconnected');
              shouldAutoRetry = true;
              break;
            case 'unavailable-id':
              errorMessage = 'Connection ID unavailable. Generating a new one and reconnecting...';
              shouldAutoRetry = true;
            break;
          default:
              errorMessage = `Connection error: ${err.message || err.type}. Attempting to fix...`;
              setConnectionStatus('error');
              shouldAutoRetry = true;
          }
        }
        
        setError(errorMessage);
        
        // Implement auto-retry logic with exponential backoff for ALL network errors
        if (shouldAutoRetry && currentAttemptCount < 10 && !callClosed) {
          const backoffDelay = Math.min(1000 * Math.pow(1.5, currentAttemptCount-1), 10000); // Exponential backoff, max 10 seconds
          
          console.log(`Auto-retrying connection in ${backoffDelay}ms (attempt ${currentAttemptCount + 1})`);
          
          // Clean up the current peer connection
          if (peer) {
            try {
              peer.destroy();
            } catch (e) {
              console.warn("Error destroying peer:", e);
            }
          }
          
          // Try to reconnect after backoff delay
          setTimeout(() => {
            if (!callClosed) {
              console.log("Executing reconnection attempt");
              setupPeerConnection(storedData, userMediaStream);
            }
          }, backoffDelay);
          
          return; // Skip the regular retry flow below since we're handling it with auto-retry
        }
          
        // For other persistent errors, return to chat
        if (!shouldAutoRetry && currentAttemptCount >= 5) {
          setError(`Could not establish a call after multiple attempts. Please try again later.`);
          
          // Show a button to return to chat
          setDebugInfo(prev => ({
            ...prev,
            showReturnToChat: true
          }));
        }
      });
      
      // Add a disconnected handler to try reconnecting
      peer.on('disconnected', () => {
        console.log('Peer disconnected. Attempting to reconnect...');
        setConnectionStatus('disconnected');
        setError('Connection temporarily lost. Attempting to reconnect...');
        
        // Try to reconnect immediately
        try {
          peer.reconnect();
          
          // If reconnect doesn't restore the connection quickly, do a full retry
          setTimeout(() => {
            if (peer.disconnected && !callClosed) {
              console.log("Reconnect didn't restore connection quickly, doing full retry");
              if (peer) {
                try { peer.destroy(); } catch (e) {}
              }
              setupPeerConnection(storedData, userMediaStream);
            }
          }, 3000);
        } catch (e) {
          console.error('Error during reconnect attempt:', e);
          
          // Do a full retry immediately
            setTimeout(() => {
              if (!callClosed) {
              if (peer) {
                try { peer.destroy(); } catch (e) {}
              }
                setupPeerConnection(storedData, userMediaStream);
              }
            }, 1000);
        }
      });
      
    } catch (err) {
      console.error('Error in setupPeerConnection:', err);
      setError(`Failed to set up connection: ${err.message}`);
      
      // If PeerJS setup failed, try direct WebRTC as fallback
      if (connectionAttemptRef.current <= 3) {
        console.log("PeerJS setup failed, trying direct WebRTC connection");
        setTimeout(() => {
          if (!callClosed) {
            setupDirectWebRTC(storedData, userMediaStream, `direct_${userId}_${Math.floor(Math.random() * 1000000)}`);
          }
        }, 1000);
      }
    }
  }, [callType, socketUrl, userId, friendSlug, handleEndCall, callClosed]);
  
  // Create a direct WebRTC connection that doesn't rely on PeerJS
  const setupDirectWebRTC = useCallback(async (storedData, userMediaStream, connectionId) => {
    console.log("Setting up direct WebRTC connection");
    setConnectionStatus('connecting');
    setError("Using direct connection method (more reliable)...");
    
    try {
      // Track connection attempt
      const attemptCount = connectionAttemptRef.current + 1;
      connectionAttemptRef.current = attemptCount;
      
      // Create socket if it doesn't exist
      if (!socketRef.current) {
        const socket = io(socketUrl);
        socketRef.current = socket;
        
        socket.on('connect', () => {
          console.log(`Socket connected with ID: ${socket.id}`);
          socket.emit("userId", userId);
        });
      }
      
      const socket = socketRef.current;
      
      // Create RTCPeerConnection with our ICE servers
      const rtcConfig = {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { 
            urls: [
              'turn:openrelay.metered.ca:443?transport=tcp',
              'turn:openrelay.metered.ca:80'
            ],
            username: 'openrelayproject',
            credential: 'openrelayproject'
          }
        ],
        iceCandidatePoolSize: 10
      };
      
      const peerConnection = new RTCPeerConnection(rtcConfig);
      peerRef.current = peerConnection; // Store in ref for cleanup
      
      // Add local tracks to connection
      userMediaStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, userMediaStream);
        console.log(`Added ${track.kind} track to RTCPeerConnection`);
      });
      
      // Listen for remote stream
      peerConnection.ontrack = (event) => {
        console.log("Received remote track:", event);
        if (event.streams && event.streams[0]) {
          console.log("Setting remote stream from track event");
          setRemoteStream(event.streams[0]);
          
          setCallData(prev => ({
            ...prev,
            remoteStream: event.streams[0],
            callInstance: peerConnection
          }));
          
          setConnectionStatus('connected');
        }
      };
      
      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          console.log("Generated ICE candidate");
          // Send candidate to peer via socket
          socket.emit('rtc-signal', {
            type: 'ice-candidate',
            candidate: event.candidate,
            senderId: userId,
            targetId: storedData.friendId,
            connectionId
          });
        }
      };
      
      // Handle connection state changes
      peerConnection.oniceconnectionstatechange = () => {
        console.log("ICE connection state:", peerConnection.iceConnectionState);
        
        switch (peerConnection.iceConnectionState) {
          case 'connected':
          case 'completed':
            setConnectionStatus('connected');
            setError(null);
            break;
          case 'failed':
            setConnectionStatus('error');
            setError("Connection failed. Trying to reconnect...");
            
            // Try to restart ICE
            try {
              peerConnection.restartIce();
            } catch (e) {
              console.error("Error restarting ICE:", e);
            }
            break;
          case 'disconnected':
            setConnectionStatus('disconnected');
            setError("Connection temporarily disconnected. Reconnecting...");
            break;
        }
      };
      
      // Set up signaling through socket.io
      socket.on('rtc-signal', async (data) => {
        // Only process signals meant for us
        if (data.targetId !== userId) return;
        
        try {
          if (data.type === 'offer' && data.senderId === storedData.friendId) {
            console.log("Received WebRTC offer");
            
            // Set remote description
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
            
            // Create answer
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            
            // Send answer back
            socket.emit('rtc-signal', {
              type: 'answer',
              answer,
              senderId: userId,
              targetId: data.senderId,
              connectionId
            });
          } 
          else if (data.type === 'answer' && data.senderId === storedData.friendId) {
            console.log("Received WebRTC answer");
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
          } 
          else if (data.type === 'ice-candidate' && data.senderId === storedData.friendId) {
            console.log("Received ICE candidate");
            try {
              await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch (e) {
              console.error("Error adding ICE candidate:", e);
            }
          }
        } catch (err) {
          console.error("Error handling WebRTC signal:", err);
        }
      });
      
      // If we should initiate the call (outgoing call)
      if (storedData.isInitiator) {
        console.log("Creating and sending WebRTC offer");
        
        // Create data channel (needed to start ICE gathering)
        peerConnection.createDataChannel('call-setup');
        
        // Create offer
        const offer = await peerConnection.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: callType === 'video',
        });
        
        await peerConnection.setLocalDescription(offer);
        
        // Send offer to peer via socket
        socket.emit('rtc-signal', {
          type: 'offer',
          offer,
          senderId: userId,
          targetId: storedData.friendId,
          connectionId,
          callType
        });
        
        // Notify via regular call channel too
        socket.emit('inCall', {
          userId,
          friendId: storedData.friendId,
          callType,
          directRTC: true,
          connectionId
        });
      } else {
        // For incoming calls, announce we're ready for a connection
        socket.emit('rtc-ready', {
          userId,
          targetId: storedData.friendId,
          connectionId,
          callType
        });
      }
      
      // Update call data for UI
      setCallData(prev => ({
        ...prev,
        localStream: userMediaStream,
        callInstance: peerConnection,
        directRTC: true
      }));
      
      // Return success
      return true;
    } catch (err) {
      console.error("Error setting up direct WebRTC:", err);
      setError(`Direct WebRTC setup failed: ${err.message}. Please refresh and try again.`);
      return false;
    }
  }, [userId, socketUrl, callType]);
  
  // Add cleanup for direct WebRTC
  useEffect(() => {
    return () => {
      // When component unmounts, clean up WebRTC connection if it exists
      if (peerRef.current instanceof RTCPeerConnection) {
        try {
          peerRef.current.close();
        } catch (e) {
          console.error("Error closing RTCPeerConnection:", e);
        }
      }
    };
  }, []);
  
  // Initial effect to load call data from storage
  useEffect(() => {
    console.log("Starting VideoCall component initialization");
    
    const loadCallData = async () => {
      try {
        // First try the friendSlug from URL to construct fallback data if needed
        const urlFriendSlug = friendSlug;
        let fallbackData = null;
        
        if (urlFriendSlug) {
          fallbackData = {
            friendId: urlFriendSlug,
            friendSlug: urlFriendSlug,
            friendName: searchParams.get('friendName') || 'Friend',
            callType: callType,
            isInitiator: true // Assume we're initiating if creating fallback data
          };
          console.log("Created fallback call data from URL parameters:", fallbackData);
        }
        
        // Get call data from our more reliable helper function
        let storedData = callHelper.getCallData();
        
        if (!storedData) {
          // Further fallbacks for maximum reliability
          console.log("No call data found from callHelper, trying alternate sources");
          
          // First try to load data from sessionStorage (most reliable)
          let storedDataStr = sessionStorage.getItem('callData');
          
          if (storedDataStr) {
            storedData = JSON.parse(storedDataStr);
            console.log("Got call data from sessionStorage:", storedData);
          } else {
            // Fallback: check for outgoing call in localStorage
            const outgoingCall = callHelper.getOutgoingCall();
            if (outgoingCall) {
              storedData = outgoingCall;
              console.log("Got call data from outgoing call storage:", storedData);
            } else {
              // One more fallback: check for incoming call in localStorage
              const incomingCall = callHelper.getIncomingCall();
              if (incomingCall) {
                storedData = {
                  friendId: incomingCall.callerId,
                  friendName: incomingCall.callerName,
                  friendPeerId: incomingCall.callerPeerId,
                  callType: incomingCall.callType,
                  isInitiator: false
                };
                console.log("Reconstructed call data from incoming call storage:", storedData);
              } else if (fallbackData) {
                // Use the fallback data as last resort
                console.log("Using fallback call data from URL");
                storedData = fallbackData;
                
                // Also save it for consistency
                sessionStorage.setItem('callData', JSON.stringify(fallbackData));
              }
            }
          }
        } else {
          console.log("Successfully loaded call data from callHelper:", storedData);
        }
        
        if (!storedData) {
          console.error("No call data found in any storage and couldn't create fallback");
          setError("No call information found. Please try initiating the call again.");
          setTimeout(() => {
            window.location.href = `/chat/${urlFriendSlug || ''}`;
          }, 2000);
          return;
        }
        
        // Get media access
        console.log(`Requesting ${callType} media access`);
        const mediaConstraints = {
          audio: {
            // More specific audio constraints for better call quality
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 2 // Stereo if available
          },
          video: callType === 'video' ? {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 }
          } : false
        };
        
        try {
          const userMediaStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
          setLocalStream(userMediaStream);
          
          // Debug audio tracks
          const audioTracks = userMediaStream.getAudioTracks();
          const videoTracks = userMediaStream.getVideoTracks();
          
          console.log(`Got media stream with ${audioTracks.length} audio tracks and ${videoTracks.length} video tracks`);
          audioTracks.forEach(track => {
            console.log("Audio track:", track.label, "enabled:", track.enabled);
            // Ensure audio is enabled
            track.enabled = true;
          });
          
          // Store complete call data
          setCallData({
            ...storedData,
            localStream: userMediaStream,
            remoteStream: null,
            callInstance: null,
            callType // Use URL parameter or default to video
          });
          
          // Also keep a copy in sessionStorage for reliability
          sessionStorage.setItem('callData', JSON.stringify({
            ...storedData,
            callType
          }));
          
          // Proceed to set up the peer connection
          setupPeerConnection(storedData, userMediaStream);
        } catch (mediaError) {
          console.error("Could not access media devices:", mediaError);
          setError(`Could not access your camera/microphone: ${mediaError.message}. Please check your permissions.`);
            
          // For audio-only calls, try fallback to just audio
          if (callType === 'video' && mediaError.name === 'NotAllowedError') {
            try {
              console.log("Trying fallback to audio-only...");
              const audioOnlyStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
              setLocalStream(audioOnlyStream);
              
              // Store complete call data
              setCallData({
                ...storedData,
                localStream: audioOnlyStream,
                remoteStream: null,
                callInstance: null,
                callType: 'audio' // Force audio-only
              });
              
              // Proceed to set up the peer connection
              setupPeerConnection(storedData, audioOnlyStream);
            } catch (audioError) {
              console.error("Could not access audio devices:", audioError);
              setError(`Could not access your microphone: ${audioError.message}`);
              
              // Navigate back to chat after error
              setTimeout(() => {
                window.location.href = `/chat/${friendSlug}`;
              }, 2000);
            }
          } else {
            // Navigate back to chat after error
            setTimeout(() => {
              window.location.href = `/chat/${friendSlug}`;
            }, 2000);
          }
        }
      } catch (err) {
        console.error("Error setting up call:", err);
        setError(`Could not start call: ${err.message}`);
        
        // Navigate back to chat after error
        setTimeout(() => {
          window.location.href = `/chat/${friendSlug}`;
        }, 2000);
      }
    };
    
    loadCallData();
    
    // Clean up when component unmounts
    return () => {
      console.log("VideoCall component unmounting, cleaning up resources");
      
      if (!callClosed) {
        // If we're not already cleanly closed, clean up resources
        if (localStream) {
          console.log("Stopping local stream tracks");
          localStream.getTracks().forEach(track => track.stop());
        }
        
        if (peerRef.current) {
          console.log("Cleaning up peer connection");
          if (peerRef.current instanceof RTCPeerConnection) {
            try {
              peerRef.current.close();
            } catch (e) {
              console.error("Error closing RTCPeerConnection:", e);
            }
          } else {
            // Assume it's a PeerJS instance
            try {
          peerRef.current.destroy();
            } catch (e) {
              console.error("Error destroying PeerJS connection:", e);
            }
          }
        }
        
        // Clear any stored call data
        callHelper.clearOutgoingCall();
        callHelper.clearIncomingCall();
        sessionStorage.removeItem('callData');
      }
    };
  }, [callType, friendSlug, setupPeerConnection, handleEndCall, callClosed, localStream, searchParams]);
  
  // Show loading until call data is available
  if (!callData || !localStream) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{height: '100vh'}}>
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <div className="ms-3">Setting up {callType === 'video' ? 'video' : 'audio'} call...</div>
      </div>
    );
  }
  
  // Show error if any
  if (error) {
    const isConnectionError = error.includes('Server connection error') || 
                               error.includes('Network connection') ||
                               error.includes('Connection') ||
                               error.includes('network') ||
                               error.includes('firewall');
    
    return (
      <div className="d-flex flex-column justify-content-center align-items-center" style={{height: '100vh'}}>
        <div className="alert alert-danger" style={{maxWidth: '500px'}}>
          <h4>Call Error</h4>
          <p>{error}</p>
          <div className="d-flex flex-wrap mt-3 gap-2">
            <button className="btn btn-primary" onClick={handleEndCall}>
              Return to Chat
            </button>
            
            {isConnectionError && (
              <button 
                className="btn btn-success" 
                onClick={async () => {
                  setError(null);
                  
                  // Reset connection attempt counter
                  connectionAttemptRef.current = 0;
                  
                  // Get stored call data
                  try {
                    const storedDataStr = sessionStorage.getItem('callData');
                    if (storedDataStr) {
                      const storedData = JSON.parse(storedDataStr);
                      const userMediaStream = localStream || 
                        await navigator.mediaDevices.getUserMedia({
                          video: callType === 'video',
                          audio: true
                        });
                      setupPeerConnection(storedData, userMediaStream);
                    }
                  } catch (err) {
                    console.error("Error retrying connection:", err);
                    setError(`Failed to retry: ${err.message}`);
                  }
                }}
              >
                Try Again
              </button>
            )}
            
            <button 
              className="btn btn-outline-secondary" 
              onClick={() => {
                const debug = checkCallStorage();
                console.log("Debug info:", debug);
                alert("Debug info logged to console");
              }}
            >
              Debug Info
            </button>
            
            {(debugInfo?.isFirewallError || error.includes('firewall')) && (
              <a 
                href="https://test.webrtc.org/" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="btn btn-warning"
              >
                Test WebRTC Connectivity
              </a>
            )}
            
            {/* Button to reset all call data */}
            <button 
              className="btn btn-danger mx-2" 
              onClick={() => {
                // Clear all call data from every possible storage location
                callHelper.clearIncomingCall();
                callHelper.clearOutgoingCall();
                sessionStorage.removeItem('callData');
                localStorage.removeItem('callData');
                localStorage.removeItem('outgoingCall');
                localStorage.removeItem('incomingCall');
                
                // Force refresh the page
                console.log("Forcing call reset and returning to chat");
                window.location.href = `/chat/${friendSlug}`;
              }}
            >
              Reset Call & Return to Chat
            </button>
          </div>
          
          {/* Simple troubleshooting guide */}
          <div className="mt-3 pt-3 border-top">
            <p className="mb-1"><strong>Troubleshooting Steps:</strong></p>
            <ol className="mb-2">
              <li>Make sure you have a stable internet connection</li>
              <li>Allow browser permissions for camera/microphone</li>
              <li>Disable any VPN or firewall that might block WebRTC</li>
              <li>Try a different browser (Chrome or Firefox recommended)</li>
              <li>If on a corporate network, try from a home network</li>
            </ol>
          </div>
          
          {/* Debug information section */}
          {debugInfo && (
            <div className="mt-3 pt-3 border-top">
              <small className="text-muted">Debug timestamp: {debugInfo.timestamp}</small>
              <div className="mt-2">
                <small>
                  <strong>Storage status:</strong>
                  <ul className="mb-0">
                    <li>Session: {debugInfo.sessionStorage ? '✅' : '❌'}</li>
                    <li>OutgoingCall: {debugInfo.localStorage_outgoing ? '✅' : '❌'}</li>
                    <li>IncomingCall: {debugInfo.localStorage_incoming ? '❌' : '✅'}</li>
                  </ul>
                </small>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  console.log("Rendering VideoCallComponent with call data");
  return (
    <div style={videoCallStyles.container}>
      {/* Header with call info */}
      <div style={videoCallStyles.header}>
        <div style={videoCallStyles.logo}>Luxora Call</div>
        <div style={videoCallStyles.callInfo}>
          <div style={videoCallStyles.callType}>
            {callType === 'video' ? (
              <>
                <span role="img" aria-label="video">🎥</span> Video
              </>
            ) : (
              <>
                <span role="img" aria-label="audio">🎧</span> Audio
              </>
            )}
          </div>
          <div>with {callData?.friendName || friendName}</div>
          <CallTimer 
            startTime={remoteStream ? Date.now() : null} 
            isCallConnected={!!remoteStream}
          />
        </div>
      </div>
      
      {/* Video container */}
      <div style={videoCallStyles.videoContainer}>
        {/* Remote video (shows placeholder if no stream) */}
        {remoteStream ? (
          <video
            ref={remoteVideoRef}
            style={videoCallStyles.remoteVideo}
            autoPlay
            playsInline
          />
        ) : (
          <div style={{
            ...videoCallStyles.remoteVideo,
            backgroundColor: '#2c3e50',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            fontSize: '5rem',
          }}>
            {callData?.friendName?.charAt(0)?.toUpperCase() || 'U'}
          </div>
        )}
        
        {/* Local video */}
        {localStream && callType === 'video' && (
          <div style={videoCallStyles.localVideoContainer}>
            <video
              ref={localVideoRef}
              style={videoCallStyles.localVideo}
              autoPlay
              playsInline
              muted
            />
          </div>
        )}
        
        {/* Controls */}
        <div style={videoCallStyles.controls}>
          <button 
            style={{
              ...videoCallStyles.controlButton,
              backgroundColor: audioEnabled ? 'rgba(255, 255, 255, 0.15)' : '#e74c3c'
            }}
            onClick={() => {
              if (localStream) {
                const audioTracks = localStream.getAudioTracks();
                if (audioTracks.length > 0) {
                  const newEnabled = !audioEnabled;
                  audioTracks.forEach(track => {
                    track.enabled = newEnabled;
                  });
                  setAudioEnabled(newEnabled);
                }
              }
            }}
            title={audioEnabled ? 'Mute' : 'Unmute'}
          >
            {audioEnabled ? '🎙️' : '🔇'}
          </button>
          
          {callType === 'video' && (
            <button 
              style={{
                ...videoCallStyles.controlButton,
                backgroundColor: videoEnabled ? 'rgba(255, 255, 255, 0.15)' : '#e74c3c'  
              }}
              onClick={() => {
                if (localStream) {
                  const videoTracks = localStream.getVideoTracks();
                  if (videoTracks.length > 0) {
                    const newEnabled = !videoEnabled;
                    videoTracks.forEach(track => {
                      track.enabled = newEnabled;
                    });
                    setVideoEnabled(newEnabled);
                  }
                }
              }}
              title={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
            >
              {videoEnabled ? '📹' : '🚫'}
            </button>
          )}
          
          <button 
            style={{...videoCallStyles.controlButton, ...videoCallStyles.endCallButton}}
            onClick={handleEndCall}
            title="End call"
          >
            ��
          </button>
        </div>
        
        {/* Connection status message */}
        <ConnectionStatus status={connectionStatus} />
        
        {/* Error message */}
        {error && (
          <div style={videoCallStyles.errorMessage}>
            {error}
            <br />
            <button 
              style={videoCallStyles.reconnectButton}
              onClick={() => window.location.reload()}
            >
              Try Again
            </button>
          </div>
        )}
        
        {/* Debug info */}
        {debugInfo && (
          <div style={videoCallStyles.debugInfo}>
            <div>Status: {debugInfo.connectionStatus}</div>
            <div>Remote Stream: {debugInfo.remoteStreamAvailable ? '✅' : '❌'}</div>
            <div>Local Stream: {debugInfo.localStreamAvailable ? '✅' : '❌'}</div>
            <div>Peer Connected: {debugInfo.peerConnected ? '✅' : '❌'}</div>
            <div>Socket Connected: {debugInfo.socketConnected ? '✅' : '❌'}</div>
            <div>Attempt: {debugInfo.attemptCount}</div>
          </div>
        )}
      </div>
    </div>
  );
};

// Create a call timer component
const CallTimer = ({ startTime, isCallConnected }) => {
  const [duration, setDuration] = useState(0);
  
  useEffect(() => {
    let interval;
    
    if (isCallConnected && startTime) {
      interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        setDuration(elapsed);
      }, 1000);
    }
    
    return () => clearInterval(interval);
  }, [isCallConnected, startTime]);
  
  // Format the duration in MM:SS format
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  
  if (!isCallConnected) return null;
  
  return (
    <div style={videoCallStyles.callTimer}>
      {formatDuration(duration)}
    </div>
  );
};

// Add status message component
const ConnectionStatus = ({ status, error }) => {
  // Map connection status to user-friendly messages
  const statusMessages = {
    initializing: "Initializing call...",
    connecting: "Connecting...",
    awaiting_peer: "Waiting for peer to connect...",
    connected: "", // No message when connected
    disconnected: "Connection lost. Attempting to reconnect...",
    ended: "Call ended",
    error: error || "Connection error. Please try again."
  };
  
  // Don't show anything if connected or no status
  if (!status || status === "connected") return null;
  
  return (
    <div style={videoCallStyles.statusMessage}>
      {statusMessages[status] || "Establishing connection..."}
    </div>
  );
};

export default VideoCall; 