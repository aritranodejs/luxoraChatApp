import React, { useState, useEffect, Suspense, lazy } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import "bootstrap/dist/css/bootstrap.min.css";
import "./styles/global.css";

// Only import components that are needed for initial render
const Profile = lazy(() => import("./components/Profile"));
const Friends = lazy(() => import("./pages/Friends"));

// Lazy load all page components
const Chat = lazy(() => import("./pages/Chat"));
const Login = lazy(() => import("./pages/Login"));
const Otp = lazy(() => import("./pages/Otp"));
const Register = lazy(() => import("./pages/Register"));
const VideoCall = lazy(() => import("./pages/VideoCall"));

// Loading component for suspense fallback
const LoadingFallback = () => (
  <div className="d-flex justify-content-center align-items-center vh-100">
    <div className="spinner-border text-primary" role="status">
      <span className="visually-hidden">Loading...</span>
    </div>
  </div>
);

function AppContent() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const { isLoggedIn } = useAuth(); 

  const closeDrawer = () => setIsDrawerOpen(false);
  const toggleDrawer = () => setIsDrawerOpen(!isDrawerOpen);
  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  useEffect(() => {
    document.body.classList.toggle("dark-mode", isDarkMode);
  }, [isDarkMode]);

  return (
    <div className="app-container d-flex vh-100">
      {isLoggedIn && (
        <div className={`sidebar bg-light border-end p-3 ${isDrawerOpen ? "open" : "collapsed"}`}>
          <Suspense fallback={<div className="p-3">Loading profile...</div>}>
            <Profile isDarkMode={isDarkMode} toggleTheme={toggleTheme} />
            <Friends onSelectChat={closeDrawer} />
          </Suspense>
        </div>
      )}

      <div className="chat-container flex-grow-1 d-flex flex-column align-items-center justify-content-center">
        {isLoggedIn && !isDrawerOpen && (
          <div className="chat-header p-2 d-flex justify-content-between align-items-center bg-white text-white w-100">
            <button className="menu-button" onClick={toggleDrawer}>☰</button>
          </div>
        )}

        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            {isLoggedIn ? (
              <>
                {/* Redirect auth pages to chat if user is already logged in */}
                <Route path="/login" element={<Navigate to="/chat" replace />} />
                <Route path="/register" element={<Navigate to="/chat" replace />} />
                <Route path="/verify-otp" element={<Navigate to="/chat" replace />} />
                
                {/* Main app routes */}
                <Route path="/chat" element={<h1 className="text-muted text-center app-title">Welcome to <span className="text-luxora">Luxora</span><span className="text-chat">Chat</span></h1>} />
                <Route path="/chat/search" element={<Suspense fallback={<LoadingFallback />}><Friends onlyFriends={false} /></Suspense>} />
                <Route path="/chat/:friendSlug" element={<Chat onClose={closeDrawer} />} />
                
                {/* Video Call Route */}
                <Route path="/call/:friendSlug" element={<VideoCall />} />
                
                <Route path="/*" element={<Navigate to="/chat" />} />
              </>
            ) : (
              <>
                {/* Auth routes for logged-out users */}
                <Route path="/login" element={<Login />} />
                <Route path="/verify-otp" element={<Otp />} />
                <Route path="/register" element={<Register />} />
                <Route path="/*" element={<Navigate to="/login" />} />
              </>
            )}
          </Routes>
        </Suspense>
      </div>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppContent /> 
      </Router>
    </AuthProvider>
  );
}

export default App;