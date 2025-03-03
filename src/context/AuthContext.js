import React, { createContext, useState, useContext } from "react";
import { register, login, sendOtp, verifyOtp, me, logout } from "../services/authService"; // Import the login function
import { setEmail, getEmail, removeEmail, setAuthToken, getAuthToken, removeAuthToken, setUser, removeUser } from "../utils/authHelper";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [isLoggedIn, setIsLoggedIn] = useState(!!getAuthToken());

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
      setEmail(data?.data?.email);
    } catch (error) {
      throw error; // Re-throw the error
    }
  };

  const handleSendOtp = async () => {
    const email = getEmail();
    try {
      const data = await sendOtp(email);
      console.log("OTP sent:", data);
    } catch (error) {
      console.error("Send OTP error:", error);
      throw error; // Re-throw the error
    }
  };

  const handleVerifyOtp = async (otp) => {
    const email = getEmail();
    try {
      const data = await verifyOtp(email, otp);
      console.log("OTP Verified:", data);

      setIsLoggedIn(true);
      setAuthToken(data?.data?.authToken);
      setUser(data?.data);
    } catch (error) {
      console.error("Send OTP error:", error);
      throw error; // Re-throw the error
    }
  }

  const handleMe = async () => {
    try {
      const data = await me();
      return data;
    } catch (error) {
      console.error("Me error:", error);
      throw error; // Re-throw the error
    }
  }

  const handleLogout = async () => {
    try {
      const data = await logout();
      console.log("Logged out:", data);
      setIsLoggedIn(false);
      removeAuthToken();
      removeEmail();
      removeUser();
    } catch (error) {
      console.error("Logout error:", error);
      throw error; // Re-throw the error
    }
  };

  const value = {
    isLoggedIn,
    handleRegister,
    handleLogin,
    handleSendOtp,
    handleVerifyOtp,
    handleMe,
    handleLogout
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);