// src/context/AuthContext.js

import React, { createContext, useState, useContext } from "react";
import { register, login, sendOtp, verifyOtp, logout } from "../services/authService"; // Import the login function

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem("authToken"));

  const handleRegister = async (name, email, password) => {
    try {
      await register(name, email, password);
    } catch (error) {
      throw error; // Re-throw the error
    }
  };

  const handleLogin = async (email, password) => {
    try {
      const data = await login(email, password);
      localStorage.setItem("email", data?.data?.email);
    } catch (error) {
      throw error; // Re-throw the error
    }
  };

  const handleSendOtp = async () => {
    const email = localStorage.getItem("email");
    try {
      const data = await sendOtp(email);
      console.log("OTP sent:", data);
    } catch (error) {
      console.error("Send OTP error:", error);
      throw error; // Re-throw the error
    }
  };

  const handleVerifyOtp = async (otp) => {
    const email = localStorage.getItem("email");
    try {
      const data = await verifyOtp(email, otp);
      console.log("OTP Verified:", data);

      setUser(data?.data);
      setIsLoggedIn(true);
      localStorage.setItem("authToken", data?.data?.authToken);
    } catch (error) {
      console.error("Send OTP error:", error);
      throw error; // Re-throw the error
    }
  }

  const handleLogout = async () => {
    try {
      const data = await logout();
      console.log("Logged out:", data);
      setUser(null);
      setIsLoggedIn(false);
      localStorage.removeItem("authToken");
      localStorage.removeItem("email");
    } catch (error) {
      console.error("Logout error:", error);
      throw error; // Re-throw the error
    }
  };

  const value = {
    user,
    isLoggedIn,
    handleRegister,
    handleLogin,
    handleSendOtp,
    handleVerifyOtp,
    handleLogout
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);