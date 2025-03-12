import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Friends from "./pages/Friends";
import Chat from "./pages/Chat";
import Login from "./pages/Login";
import Otp from "./pages/Otp";
import Register from "./pages/Register";
import Profile from "./components/Profile";
import { AuthProvider, useAuth } from "./context/AuthContext";
import "bootstrap/dist/css/bootstrap.min.css";
import "./styles/global.css";

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
          <Profile isDarkMode={isDarkMode} toggleTheme={toggleTheme} />
          <Friends onSelectChat={closeDrawer} />
        </div>
      )}

      <div className="chat-container flex-grow-1 d-flex flex-column align-items-center justify-content-center">
        {isLoggedIn && !isDrawerOpen && (
          <div className="chat-header p-2 d-flex justify-content-between align-items-center bg-white text-white w-100">
            <button className="menu-button" onClick={toggleDrawer}>☰</button>
          </div>
        )}

        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/verify-otp" element={<Otp />} />
          <Route path="/register" element={<Register />} />
          {isLoggedIn ? (
            <>
              <Route path="/chat" element={<h1 className="text-muted text-center app-title">Welcome to LuxoraChat</h1>} />
              <Route path="/chat/search" element={<Friends onlyFriends={false} />} />
              <Route path="/chat/:friendSlug" element={<Chat onClose={closeDrawer} />} />
              <Route path="/*" element={<Navigate to="/chat" />} />
            </>
          ) : (
            <Route path="/*" element={<Navigate to="/login" />} />
          )}
        </Routes>
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