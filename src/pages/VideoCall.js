import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import VideoCallComponent from '../components/VideoCall';
import { io } from "socket.io-client";
import { getUser } from "../utils/authHelper";
import Peer from "peerjs";
import * as callHelper from "../utils/callHelper"; // Import call helper utilities

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
  
  // Refs
  const peerRef = useRef(null);
  const connectionAttemptRef = useRef(0);
  const socketRef = useRef(null);
  
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
    
    // Close peer connection
    if (peerRef.current) {
      console.log("Destroying peer connection");
      peerRef.current.destroy();
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
      
      // Create a new Peer with a random ID to avoid collision
      // IMPORTANT: Use the cloud PeerJS server by NOT specifying host, port, or path
      const randomId = `peer_${userId}_${Math.floor(Math.random() * 1000000)}`;
      
      // Check if we should use a retry configuration
      let peerConfig = {
        // Don't rely on the public peerjs server which has connection limits
        // Use a direct WebRTC connection with only STUN/TURN servers
        config: {
          'iceServers': [
            // Public STUN servers
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            // More reliable TURN servers
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
            {
              urls: 'turn:numb.viagenie.ca',
              credential: 'muazkh',
              username: 'webrtc@live.com'
            }
          ],
          'sdpSemantics': 'unified-plan',
          'iceCandidatePoolSize': 10
        },
        // Increase debug level for better logs
        debug: 3
      };
      
      // If we're in a retry, use alternative configurations
      if (attemptCount > 1) {
        console.log(`Using alternative configuration for retry attempt ${attemptCount}`);
        
        // On second attempt, use a self-hosted configuration
        if (attemptCount === 2) {
          peerConfig = {
            // Try without specifying host (use default PeerJS server)
            debug: 3,
            config: {
              'iceServers': [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
              ]
            }
          };
        }
        // On third attempt, use a minimal configuration with highly reliable STUN/TURN
        else if (attemptCount === 3) {
          peerConfig = {
            // Use PeerJS cloud server with minimal config
            key: 'peerjs',
            host: 'peerjs-server.herokuapp.com', 
            secure: true,
            port: 443,
            debug: 3,
            config: {
              'iceServers': [
                { urls: 'stun:stun.l.google.com:19302' },
                {
                  urls: 'turn:openrelay.metered.ca:443?transport=tcp',
                  username: 'openrelayproject',
                  credential: 'openrelayproject'
                }
              ]
            }
          };
        }
        // On fourth attempt, use only STUN (for restrictive networks)
        else if (attemptCount === 4) {
          peerConfig = {
            // Try alternate PeerJS server
            host: 'peerjs-server-v2.herokuapp.com',
            secure: true,
            port: 443,
            debug: 3,
            config: {
              'iceServers': [
                { urls: 'stun:stun.l.google.com:19302' }
              ]
            }
          };
        }
        // On fifth attempt, try a completely different approach
        else if (attemptCount >= 5) {
          // As a last resort, try with no server and direct WebRTC only
          peerConfig = {
            config: {
              'iceServers': [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:global.stun.twilio.com:3478?transport=udp' },
                {
                  urls: 'turn:numb.viagenie.ca',
                  credential: 'muazkh',
                  username: 'webrtc@live.com'
                }
              ]
            }
          };
        }
      }
      
      // Use the storedData's retryConfig if it exists (from advanced error handling)
      if (storedData?.retryConfig) {
        console.log("Using retry config from stored data:", storedData.retryConfig);
        peerConfig.config = storedData.retryConfig;
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
      
      socket.on('connect_error', (err) => {
        console.error(`Socket connection error: ${err.message}`);
      });
      
      socket.emit("userId", userId);
      console.log("Socket connected for signaling, userId:", userId);
      
      // Add specific handler for incoming calls to support mid-call joins
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
        }
      });
      
      // Handle direct call signals for more reliable peer connection
      socket.on("directCallSignal", (data) => {
        console.log("Received direct call signal:", data);
        
        // Only process if this signal is for us and matches our current call
        if (data.targetId === userId || data.friendId === userId) {
          console.log("Processing direct call signal intended for us");
          
          // Update peer ID if available
          if (data.callerPeerId && storedData && !connectionEstablished) {
            console.log("Updating peer ID from direct call signal");
            storedData.friendPeerId = data.callerPeerId;
            
            // Try to establish a connection if we're not the initiator
            if (!storedData.isInitiator && peer) {
              console.log("Attempting direct connection to caller's peer");
              const call = peer.call(data.callerPeerId, userMediaStream);
              
              call.on('stream', (incomingStream) => {
                console.log('Received remote stream via direct signal');
                connectionEstablished = true;
                setRemoteStream(incomingStream);
                
                setCallData(prev => ({
                  ...prev,
                  remoteStream: incomingStream,
                  callInstance: call
                }));
              });
            }
          }
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
        
        // Notify via socket about the error to help debugging
        if (socket && socket.connected) {
          socket.emit('peerConnectionError', {
            userId,
            friendId: storedData?.friendId,
            error: err.type,
            message: err.message,
            peerId: randomId,
            attemptCount
          });
        }
        
        let errorMessage;
        switch (err.type) {
          case 'peer-unavailable':
            errorMessage = 'Your friend appears to be offline or unavailable.';
            break;
          case 'browser-incompatible':
            errorMessage = 'Your browser may not fully support video calls. Try using Chrome or Firefox.';
            break;
          case 'network':
            errorMessage = 'Network connection issue. Please check your internet connection and trying again.';
            break;
          case 'disconnected':
            errorMessage = 'Connection lost. Will try to reconnect automatically...';
            break;
          case 'server-error':
            errorMessage = 'Server connection error. Trying alternative connection method...';
            break;
          case 'socket-error':
            errorMessage = 'Signaling server issue. Trying alternative connection approach...';
            break;
          case 'socket-closed':
            errorMessage = 'Signaling connection closed. Retrying with backup servers...';
            break;
          default:
            errorMessage = `Connection error (${err.type}). Retrying with a different approach...`;
        }
        
        setError(errorMessage);
        
        // For network errors, we can try a more aggressive retry approach
        if ((err.type === 'network' || err.type === 'disconnected' || err.type === 'server-error') && attemptCount < 5 && !callClosed) {
          console.log(`Network error detected. Aggressive retry approach (attempt ${attemptCount + 1})`);
          
          // Try with different ICE server configurations on each retry
          const retryConfigs = [
            // Try with pure Google STUN servers only
            [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' }
            ],
            // Try with Twilio TURN servers
            [
              { urls: 'stun:stun.l.google.com:19302' },
              {
                urls: [
                  'turn:global.turn.twilio.com:3478?transport=udp',
                  'turn:global.turn.twilio.com:3478?transport=tcp'
                ],
                username: 'f4b4035eaa76f4a55de5f4351567653ee4ff6fa97b50b6b334fcc1be9c27212d',
                credential: 'w1WpNmENT5ozGaKBUJM+c4tJjr7eSJlE8QOUTJwyF8w='
              }
            ],
            // Try with TCP-only connection (for restrictive networks)
            [
              { urls: 'stun:stun.l.google.com:19302' },
              {
                urls: 'turn:turn.anyfirewall.com:443?transport=tcp',
                username: 'webrtc',
                credential: 'webrtc'
              }
            ],
            // Try with minimal configuration 
            [
              { urls: 'stun:stun.l.google.com:19302' }
            ],
            // Last resort: try with all possible servers
            [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
              { urls: 'stun:stun2.l.google.com:19302' },
              { urls: 'stun:stun3.l.google.com:19302' },
              { urls: 'stun:stun4.l.google.com:19302' },
              {
                urls: [
                  'turn:global.turn.twilio.com:3478?transport=udp',
                  'turn:global.turn.twilio.com:3478?transport=tcp'
                ],
                username: 'f4b4035eaa76f4a55de5f4351567653ee4ff6fa97b50b6b334fcc1be9c27212d',
                credential: 'w1WpNmENT5ozGaKBUJM+c4tJjr7eSJlE8QOUTJwyF8w='
              },
              {
                urls: 'turn:turn.anyfirewall.com:443?transport=tcp',
                username: 'webrtc',
                credential: 'webrtc'
              },
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
            ]
          ];
          
          // Destroy the current peer
          if (peer) peer.destroy();
          
          // Wait a bit longer between retries for network stabilization
          setTimeout(() => {
            if (!callClosed) {
              // Choose config based on attempt count, cycling through options
              const configIndex = attemptCount % retryConfigs.length;
              console.log(`Using retry config #${configIndex + 1}`);
              
              // Preserve the original data but with new ICE servers
              const modifiedData = {
                ...storedData,
                retryConfig: {
                  iceServers: retryConfigs[configIndex],
                  iceCandidatePoolSize: 5
                }
              };
              
              setupPeerConnection(modifiedData, userMediaStream);
            }
          }, 2000); // 2 second delay for network stabilization
        }
        // For other errors, use the default retry approach
        else if (attemptCount < 3 && !callClosed) {
          console.log(`Regular retry for error (attempt ${attemptCount + 1})`);
          
          // Destroy the current peer and retry with a different configuration
          if (peer) peer.destroy();
          
          setTimeout(() => {
            if (!callClosed) {
              setupPeerConnection(storedData, userMediaStream);
            }
          }, 1000);
        }
      });
      
      // Add a disconnected handler to try reconnecting
      peer.on('disconnected', () => {
        console.log('Peer disconnected. Attempting to reconnect...');
        
        // Try to reconnect
        try {
          peer.reconnect();
        } catch (e) {
          console.error('Error during reconnect attempt:', e);
          
          // If reconnect fails, do a full retry
          if (attemptCount < 5 && !callClosed) {
            setTimeout(() => {
              if (!callClosed) {
                if (peer) peer.destroy();
                setupPeerConnection(storedData, userMediaStream);
              }
            }, 1000);
          }
        }
      });
      
    } catch (err) {
      console.error('Error in setupPeerConnection:', err);
      setError(`Failed to set up connection: ${err.message}`);
    }
  }, [callType, socketUrl, userId, friendSlug, handleEndCall, callClosed]);
  
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
          console.log("Destroying peer connection");
          peerRef.current.destroy();
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
  return <VideoCallComponent callData={callData} onEndCall={handleEndCall} />;
};

export default VideoCall; 