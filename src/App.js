import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Friends from "./pages/Friends";
import Chat from "./pages/Chat";
import Login from "./pages/Login";
import Register from "./pages/Register";
import "bootstrap/dist/css/bootstrap.min.css";
import "./styles/global.css";
import Profile from "./components/Profile";

function App() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);

  const closeDrawer = () => {
    setIsDrawerOpen(false);
  };

  const toggleDrawer = () => {
    setIsDrawerOpen(!isDrawerOpen);
  };

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
  };

  useEffect(() => {
    if (isDarkMode) {
      document.body.classList.add("dark-mode");
    } else {
      document.body.classList.remove("dark-mode");
    }
  }, [isDarkMode]);

  return (
    <Router>
      <div className="app-container d-flex vh-100">
        {/* Sidebar / App Drawer */}
        <div className={`sidebar bg-light border-end p-3 ${isDrawerOpen ? "open" : "collapsed"}`}>
          <Profile isDarkMode={isDarkMode} toggleTheme={toggleTheme} /> {/* Pass props */}
          <Friends onSelectChat={closeDrawer} />
        </div>
        
        {/* Chat Container */}
        <div className="chat-container flex-grow-1 d-flex flex-column align-items-center justify-content-center">
          {!isDrawerOpen && (
            <div className="chat-header p-2 d-flex justify-content-between align-items-center bg-white text-white w-100">
              <button className="menu-button" onClick={toggleDrawer}>☰</button>
            </div>
          )}
          <Routes>
            <Route path="/chat" element={<h1 className="text-muted">Welcome to LuxoraChat</h1>} />
            <Route path="/chat/search" element={<Friends onlyFriends={false} />} />
            <Route path="/chat/:friendId" element={<Chat onClose={closeDrawer} />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/*" element={<Navigate to="/chat" />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;