import React, { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faPhoneSlash, 
  faMicrophone, 
  faMicrophoneSlash,
  faVideo,
  faVideoSlash,
  faExpand,
  faCompress,
  faVolumeMute,
  faVolumeUp
} from '@fortawesome/free-solid-svg-icons';
import '../styles/VideoCall.css';
import * as callHelper from "../utils/callHelper"; // Import call helper utilities

const VideoCallComponent = ({ callData, onEndCall }) => {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [speakerOff, setSpeakerOff] = useState(false);
  const [connectionState, setConnectionState] = useState('connecting');
  
  // Set up timer for call duration
  useEffect(() => {
    const timer = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);
    
    return () => clearInterval(timer);
  }, []);
  
  // Format duration as MM:SS
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  
  // Set up video streams
  useEffect(() => {
    // Set local stream
    if (localVideoRef.current && callData.localStream) {
      localVideoRef.current.srcObject = callData.localStream;
      console.log("Set local video stream", {
        audioTracks: callData.localStream.getAudioTracks().length,
        videoTracks: callData.localStream.getVideoTracks().length
      });
    }
    
    // Set remote stream when available
    if (remoteVideoRef.current && callData.remoteStream) {
      remoteVideoRef.current.srcObject = callData.remoteStream;
      console.log("Set remote video stream", {
        audioTracks: callData.remoteStream.getAudioTracks().length,
        videoTracks: callData.remoteStream.getVideoTracks().length
      });
      
      // Ensure audio is enabled for the remote stream
      const audioTracks = callData.remoteStream.getAudioTracks();
      if (audioTracks.length > 0) {
        audioTracks.forEach(track => {
          track.enabled = true;
        });
        console.log("Enabled remote audio tracks");
      } else {
        console.warn("No audio tracks found in remote stream");
      }
      
      // Update connection state
      setConnectionState('connected');
    } else {
      setConnectionState('connecting');
    }
    
    // Initial setup of audio tracks
    if (callData.localStream) {
      const audioTracks = callData.localStream.getAudioTracks();
      if (audioTracks.length > 0) {
        // Ensure initial audio state matches UI
        audioTracks.forEach(track => {
          track.enabled = !muted;
        });
        
        // Debug info
        audioTracks.forEach((track, index) => {
          console.log(`Audio track ${index} state:`, {
            enabled: track.enabled,
            muted: track.muted,
            id: track.id,
            readyState: track.readyState
          });
        });
      } else {
        console.warn("No local audio tracks available!");
      }
    }
    
    // Clear call storage when we start a call to avoid confusion
    callHelper.clearIncomingCall();
    
    // When this component mounts, any existing call has already been accepted
    if (callData.callInstance) {
      console.log("Call is in progress, clearing all pending call data");
      callHelper.clearOutgoingCall();
    }
    
    // Make sure volume is at maximum for better audibility
    if (remoteVideoRef.current) {
      remoteVideoRef.current.volume = 1.0;
    }
    
    // Setup audio output to speaker if available
    if (remoteVideoRef.current && remoteVideoRef.current.setSinkId) {
      try {
        // Try to set audio output to speaker for better call quality
        navigator.mediaDevices.enumerateDevices()
          .then(devices => {
            const speakers = devices.filter(device => 
              device.kind === 'audiooutput' && 
              device.label.toLowerCase().includes('speaker')
            );
            
            if (speakers.length > 0) {
              remoteVideoRef.current.setSinkId(speakers[0].deviceId)
                .then(() => console.log("Audio output set to speaker"))
                .catch(e => console.warn("Could not set audio output:", e));
            }
          })
          .catch(e => console.warn("Could not enumerate devices:", e));
      } catch (e) {
        console.warn("setSinkId not supported or failed:", e);
      }
    }
  }, [callData.localStream, callData.remoteStream, callData.callInstance, muted]);
  
  // Handle mute toggle
  const toggleMute = () => {
    if (callData.localStream) {
      const audioTracks = callData.localStream.getAudioTracks();
      if (audioTracks.length > 0) {
        const enabled = !muted;
        audioTracks.forEach(track => {
          track.enabled = enabled;
        });
        setMuted(!enabled);
      }
    }
  };
  
  // Handle video toggle
  const toggleVideo = () => {
    if (callData.localStream) {
      const videoTracks = callData.localStream.getVideoTracks();
      if (videoTracks.length > 0) {
        const enabled = !videoOff;
        videoTracks.forEach(track => {
          track.enabled = enabled;
        });
        setVideoOff(!enabled);
      }
    }
  };
  
  // Handle speaker toggle
  const toggleSpeaker = () => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.muted = !speakerOff;
      setSpeakerOff(!speakerOff);
    }
  };
  
  // Handle fullscreen toggle
  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(e => {
        console.error(`Error attempting to enable full-screen mode: ${e.message}`);
      });
      setIsFullScreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        setIsFullScreen(false);
      }
    }
  };
  
  // Handle ending the call
  const handleEndCall = () => {
    // Clear any call storage
    callHelper.clearOutgoingCall();
    callHelper.clearIncomingCall();
    
    // Call the parent's onEndCall handler
    if (onEndCall) {
      onEndCall();
    }
  };
  
  return (
    <div className="video-call-container">
      <div className="call-header">
        <div className="caller-info">
          <h4>{callData.friendName}</h4>
          <div className="call-duration">
            {connectionState === 'connected' ? formatDuration(callDuration) : 'Connecting...'}
          </div>
        </div>
      </div>
      
      <div className="video-grid">
        {/* Remote video (large) */}
        <div className="remote-video-container">
          {callData.remoteStream ? (
            <video
              ref={remoteVideoRef}
              className="remote-video"
              autoPlay
              playsInline
              muted={speakerOff}
            ></video>
          ) : (
            <div className="connecting-placeholder">
              <div className="spinner-border text-light" role="status">
                <span className="visually-hidden">Connecting...</span>
              </div>
              <p>Connecting to {callData.friendName}...</p>
            </div>
          )}
        </div>
        
        {/* Local video (small overlay) */}
        <div className="local-video-container">
          {callData.callType === 'video' ? (
            <video
              ref={localVideoRef}
              className="local-video"
              autoPlay
              playsInline
              muted
            ></video>
          ) : (
            <div className="audio-only-indicator">
              <p>Audio Call</p>
            </div>
          )}
        </div>
      </div>
      
      <div className="call-controls">
        <button 
          className={`control-btn ${muted ? 'control-btn-active' : ''}`}
          onClick={toggleMute}
          title={muted ? "Unmute" : "Mute"}
        >
          <FontAwesomeIcon icon={muted ? faMicrophoneSlash : faMicrophone} />
        </button>
        
        <button 
          className="control-btn control-btn-end" 
          onClick={handleEndCall}
          title="End Call"
        >
          <FontAwesomeIcon icon={faPhoneSlash} />
        </button>
        
        {callData.callType === 'video' && (
          <button 
            className={`control-btn ${videoOff ? 'control-btn-active' : ''}`}
            onClick={toggleVideo}
            title={videoOff ? "Turn Camera On" : "Turn Camera Off"}
          >
            <FontAwesomeIcon icon={videoOff ? faVideoSlash : faVideo} />
          </button>
        )}
        
        <button 
          className={`control-btn ${speakerOff ? 'control-btn-active' : ''}`}
          onClick={toggleSpeaker}
          title={speakerOff ? "Turn Speaker On" : "Turn Speaker Off"}
        >
          <FontAwesomeIcon icon={speakerOff ? faVolumeMute : faVolumeUp} />
        </button>
        
        <button 
          className={`control-btn ${isFullScreen ? 'control-btn-active' : ''}`}
          onClick={toggleFullScreen}
          title={isFullScreen ? "Exit Fullscreen" : "Enter Fullscreen"}
        >
          <FontAwesomeIcon icon={isFullScreen ? faCompress : faExpand} />
        </button>
      </div>
    </div>
  );
};

export default VideoCallComponent; 