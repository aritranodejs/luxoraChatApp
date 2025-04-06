import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import VideoCallComponent from '../components/VideoCall';
import { io } from "socket.io-client";
import { getUser } from "../utils/authHelper";
import Peer from "peerjs";

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
  
  // Refs
  const peerRef = useRef(null);
  const connectionAttemptRef = useRef(0);
  const socketRef = useRef(null);
  
  const userId = getUser()?.id;
  const socketUrl = process.env.REACT_APP_SOCKET_URL || "http://localhost:5000";

  // Get callType from URL params
  const searchParams = new URLSearchParams(location.search);
  const callType = searchParams.get('callType') || 'video'; // Default to video if not specified
  const friendName = searchParams.get('friendName') || 'Friend';

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
    
    // Navigate back to chat
    window.location.href = `/chat/${friendSlug}`;
  }, [friendSlug, localStream]);
  
  // Function to set up the peer connection
  const setupPeerConnection = useCallback(async (storedData, userMediaStream) => {
    try {
      const attemptCount = connectionAttemptRef.current + 1;
      connectionAttemptRef.current = attemptCount;
      
      console.log(`Setting up peer connection - attempt ${attemptCount}`);
      
      // Create a new Peer with a random ID to avoid collision
      // Important: Use a completely local Peer instance that doesn't rely on external servers
      const randomId = `peer_${userId}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      
      const peer = new Peer(randomId, {
        // Don't use any external server
        host: '0.0.0.0',
        port: 9000,
        path: '/myapp',
        // Use Google's STUN servers for direct connection
        config: {
          'iceServers': [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
            // Add some free TURN servers for better connectivity
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
        }
      });
      
      peerRef.current = peer;
      
      // Signal channel setup through socket.io
      const socket = io(socketUrl);
      socketRef.current = socket;
      
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
      
      // Flag to track if we've established a connection
      let connectionEstablished = false;
      
      // When our peer server is ready
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
            console.log('Received incoming call, answering automatically');
            incomingCall.answer(userMediaStream);
            
            incomingCall.on('stream', (incomingStream) => {
              console.log('Received remote stream as receiver');
              connectionEstablished = true;
              setRemoteStream(incomingStream);
              
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
            if (attemptCount < 3) {
              // Retry with a different approach
              peer.destroy();
              socketRef.current?.disconnect();
              
              console.log(`Retrying with different configuration (attempt ${attemptCount + 1})`);
              setTimeout(() => {
                if (!callClosed) {
                  setupPeerConnection(storedData, userMediaStream);
                }
              }, 1000);
            } else {
              setError('Could not establish a connection after multiple attempts. Please try again later.');
            }
          }
        }, 10000);
      });
      
      // Handle peer error
      peer.on('error', (err) => {
        console.error('Peer connection error:', err);
        
        let errorMessage;
        switch (err.type) {
          case 'peer-unavailable':
            errorMessage = 'Your friend appears to be offline or unavailable.';
            break;
          case 'browser-incompatible':
            errorMessage = 'Your browser may not fully support video calls. Try using Chrome or Firefox.';
            break;
          default:
            errorMessage = `Connection error (${err.type}). Retrying with a different approach...`;
        }
        
        setError(errorMessage);
        
        // Always retry for any error with PeerJS
        if (attemptCount < 3 && !callClosed) {
          console.log(`Retrying with different configuration after error (attempt ${attemptCount + 1})`);
          
          // Destroy the current peer and retry with a different configuration
          if (peer) peer.destroy();
          
          setTimeout(() => {
            if (!callClosed) {
              setupPeerConnection(storedData, userMediaStream);
            }
          }, 1000);
        }
      });
      
    } catch (err) {
      console.error('Error in setupPeerConnection:', err);
      setError(`Failed to set up connection: ${err.message}`);
    }
  }, [callType, socketUrl, userId, friendSlug, handleEndCall, callClosed]);
  
  // Main setup effect
  useEffect(() => {
    console.log("VideoCall page mounted, URL call type:", callType);
    
    const setupCall = async () => {
      try {
        // Get stored call data
        let storedData = null;
        try {
          const storedDataStr = sessionStorage.getItem('callData');
          if (storedDataStr) {
            storedData = JSON.parse(storedDataStr);
            console.log("Retrieved call data from sessionStorage:", storedData);
          } else {
            setError("No call data available");
            return;
          }
        } catch (err) {
          console.error("Error parsing stored call data:", err);
          setError("Failed to parse call data");
          return;
        }
        
        // Get media stream
        const isVideoCall = callType === 'video'; // Used locally for media constraints
        console.log(`Requesting media with video=${isVideoCall}`);
        
        const userMediaStream = await navigator.mediaDevices.getUserMedia({
          video: isVideoCall,
          audio: true
        });
        
        console.log("Got local media stream");
        setLocalStream(userMediaStream);
        
        // Create basic call data
        setCallData({
          friendName: friendName,
          friendId: friendSlug,
          isVideoCall: isVideoCall,  // Used in VideoCallComponent
          localStream: userMediaStream,
          remoteStream: null,
          callInstance: null
        });
        
        // Set up peer connection
        await setupPeerConnection(storedData, userMediaStream);
      } catch (err) {
        console.error("Error setting up call:", err);
        setError(`Error setting up call: ${err.message}`);
      }
    };
    
    setupCall();
    
    // Cleanup when component unmounts
    return () => {
      if (!callClosed) {
        // Stop media streams
        if (localStream) {
          localStream.getTracks().forEach(track => track.stop());
        }
        
        // Close peer connection
        if (peerRef.current) {
          peerRef.current.destroy();
        }
        
        // Close socket
        if (socketRef.current) {
          socketRef.current.disconnect();
        }
      }
    };
  }, [callType, friendName, friendSlug, setupPeerConnection, callClosed, localStream]);
  
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
                               error.includes('Network connection error') ||
                               error.includes('Connection attempt');
    
    return (
      <div className="d-flex flex-column justify-content-center align-items-center" style={{height: '100vh'}}>
        <div className="alert alert-danger">
          <h4>Call Error</h4>
          <p>{error}</p>
          <div className="d-flex mt-3 gap-2">
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
          </div>
        </div>
      </div>
    );
  }

  console.log("Rendering VideoCallComponent with call data");
  return <VideoCallComponent callData={callData} onEndCall={handleEndCall} />;
};

export default VideoCall; 