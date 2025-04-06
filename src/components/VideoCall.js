import React, { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faPhoneSlash, 
  faMicrophone, 
  faMicrophoneSlash,
  faVideo,
  faVideoSlash,
  faExpand,
  faCompress
} from '@fortawesome/free-solid-svg-icons';
import '../styles/VideoCall.css';

const VideoCallComponent = ({ callData, onEndCall }) => {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [isFullScreen, setIsFullScreen] = useState(false);
  
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
    }
    
    // Set remote stream when available
    if (remoteVideoRef.current && callData.remoteStream) {
      remoteVideoRef.current.srcObject = callData.remoteStream;
    }
  }, [callData.localStream, callData.remoteStream]);
  
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
  
  return (
    <div className="video-call-container">
      <div className="call-header">
        <div className="caller-info">
          <h4>{callData.friendName}</h4>
          <div className="call-duration">{formatDuration(callDuration)}</div>
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
          {callData.isVideoCall ? (
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
        >
          <FontAwesomeIcon icon={muted ? faMicrophoneSlash : faMicrophone} />
        </button>
        
        <button 
          className="control-btn control-btn-end" 
          onClick={onEndCall}
        >
          <FontAwesomeIcon icon={faPhoneSlash} />
        </button>
        
        {callData.isVideoCall && (
          <button 
            className={`control-btn ${videoOff ? 'control-btn-active' : ''}`}
            onClick={toggleVideo}
          >
            <FontAwesomeIcon icon={videoOff ? faVideoSlash : faVideo} />
          </button>
        )}
        
        <button 
          className={`control-btn ${isFullScreen ? 'control-btn-active' : ''}`}
          onClick={toggleFullScreen}
        >
          <FontAwesomeIcon icon={isFullScreen ? faCompress : faExpand} />
        </button>
      </div>
    </div>
  );
};

export default VideoCallComponent; 