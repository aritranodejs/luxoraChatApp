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
      
      // Initialize PeerJS with specific configuration
      // Try different configurations based on attempt number
      let peerConfig;
      
      // If we've tried the first server and it failed, try alternative configurations
      if (attemptCount === 1) {
        // Default configuration - using the free public PeerJS server
        peerConfig = {
          debug: 2 // Set debug level for more logging
        };
      } else if (attemptCount === 2) {
        // Alternative configuration 1 - using a different public STUN server
        peerConfig = {
          debug: 2,
          config: {
            'iceServers': [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:global.stun.twilio.com:3478' }
            ]
          }
        };
      } else {
        // Alternative configuration 2 - connecting in restricted mode
        peerConfig = {
          debug: 2,
          config: {
            'iceServers': [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
              { urls: 'stun:stun2.l.google.com:19302' },
              { urls: 'stun:stun3.l.google.com:19302' },
              { urls: 'stun:stun4.l.google.com:19302' }
            ]
          }
        };
      }
      
      console.log(`Using PeerJS configuration for attempt ${attemptCount}:`, peerConfig);
      
      const peer = new Peer(undefined, peerConfig);
      peerRef.current = peer;
      
      // Add timeout for connection
      const peerConnectionTimeout = setTimeout(() => {
        if (!peer.disconnected) {
          console.log("PeerJS connection timeout - destroying and trying again");
          peer.destroy();
          
          // Show a more user-friendly error with attempt info
          setError(`Connection attempt ${attemptCount} timed out. ${attemptCount < 3 ? "Trying again..." : "Please check your internet connection and try again."}`);
          
          // Retry if we haven't reached max attempts
          if (attemptCount < 3) {
            setTimeout(() => {
              if (!callClosed) {
                setupPeerConnection(storedData, userMediaStream);
              }
            }, 2000);
          }
        }
      }, 15000); // 15 second timeout
      
      // Wait for peer to open connection
      peer.on('open', (id) => {
        console.log(`My peer ID is: ${id}`);
        clearTimeout(peerConnectionTimeout);
        
        // Socket setup for signaling
        const socket = io(socketUrl);
        socketRef.current = socket;
        socket.emit("userId", userId);
        
        console.log("Socket connected, userId:", userId);
        
        // Check if we're the initiator
        const isInitiator = storedData?.isInitiator === true;
        const friendPeerId = storedData?.friendPeerId;
        
        console.log(`Call type: ${callType}, Initiator: ${isInitiator}, Friend PeerID: ${friendPeerId}`);
        
        if (isInitiator) {
          // We started the call, so we need to call them
          console.log(`Calling peer ${friendPeerId} with ${callType} call`);
          
          if (!friendPeerId) {
            setError(`Cannot connect to peer: missing peer ID`);
            return;
          }
          
          const call = peer.call(friendPeerId, userMediaStream, {
            metadata: { callType }
          });
          
          // Handle the response with their stream
          call.on('stream', (incomingStream) => {
            console.log('Received remote stream as initiator');
            setRemoteStream(incomingStream);
            
            // Update callData with the streams and call instance
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
            setError(`Call error: ${err.message}`);
          });
        } else {
          // We're receiving a call, wait for the call event
          console.log('Waiting for incoming call');
          
          peer.on('call', (incomingCall) => {
            console.log('Received incoming call, answering');
            incomingCall.answer(userMediaStream);
            
            incomingCall.on('stream', (incomingStream) => {
              console.log('Received remote stream as receiver');
              setRemoteStream(incomingStream);
              
              // Update callData with the streams and call instance
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
              setError(`Call error: ${err.message}`);
            });
          });
        }
        
        // Socket handlers
        socket.on("callAccepted", ({ accepterId, accepterPeerId }) => {
          console.log("Call accepted by:", accepterId, "with peer ID:", accepterPeerId);
          
          // If we get an accepter peer ID, update our stored data
          if (accepterPeerId) {
            setCallData(prev => ({
              ...prev,
              friendPeerId: accepterPeerId
            }));
          }
        });
        
        socket.on("callEnded", () => {
          console.log("Call ended by the other user");
          setCallClosed(true);
          handleEndCall();
        });
        
        socket.on("callRejected", () => {
          console.log("Call was rejected by the recipient");
          setCallClosed(true);
          handleEndCall();
        });
      });
      
      // Set up peer error handler
      peer.on('error', (err) => {
        console.error('Peer connection error:', err);
        
        // Map error types to user-friendly messages
        let errorMessage;
        switch (err.type) {
          case 'server-error':
            errorMessage = `Server connection error (attempt ${attemptCount}/3)`;
            break;
          case 'network':
            errorMessage = 'Network connection error. Please check your internet connection.';
            break;
          case 'peer-unavailable':
            errorMessage = 'Your friend appears to be offline or unavailable.';
            break;
          case 'browser-incompatible':
            errorMessage = 'Your browser may not fully support video calls. Try using Chrome or Firefox.';
            break;
          default:
            errorMessage = `Connection error: ${err.type}`;
        }
        
        setError(errorMessage);
        
        // Retry connection for certain errors
        const retryableErrors = ['server-error', 'network', 'socket-error', 'socket-closed'];
        
        if (retryableErrors.includes(err.type) && attemptCount < 3) {
          console.log(`Retrying peer connection after ${err.type} error... (attempt ${attemptCount + 1})`);
          setTimeout(() => {
            if (!callClosed) {
              setupPeerConnection(storedData, userMediaStream);
            }
          }, 3000);
        }
      });
    } catch (err) {
      console.error('Error setting up peer connection:', err);
      setError(`Failed to set up connection: ${err.message}`);
    }
  }, [callType, socketUrl, userId, handleEndCall, callClosed]);
  
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