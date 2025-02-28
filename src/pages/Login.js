import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { handleLogin, handleSendOtp } = useAuth();
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);  
  const navigate = useNavigate();

  const validateForm = () => {
    const newErrors = {};

    if (!email.trim()) {
      newErrors.email = "Email is required";
    }

    if (!password.trim()) {
      newErrors.password = "Password is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true); 

    try {
      await handleLogin(email, password);
      await handleSendOtp();
      navigate("/verify-otp");
    } catch (error) {
      console.log("Login failed:", error?.message);
      setErrors((prevErrors) => ({
        ...prevErrors,
        server: error?.message || "An unexpected error occurred. Please try again.",
      }));
    } finally {
      setLoading(false); 
    }
  };

  return (
    <div className="container mt-5">
      <div className="card p-4 shadow-sm mx-auto" style={{ maxWidth: "400px" }}>
        <h3 className="text-center">Login</h3>
        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="form-label">Email</label>
            <input
              type="email"
              className={`form-control ${errors.email ? "is-invalid" : ""}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {errors.email && <div className="invalid-feedback">{errors.email}</div>}
          </div>

          <div className="mb-3">
            <label className="form-label">Password</label>
            <input
              type="password"
              className={`form-control ${errors.password ? "is-invalid" : ""}`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {errors.password && <div className="invalid-feedback">{errors.password}</div>}
          </div>

          <div className="mb-3">
            {errors.server && <div className="invalid-feedback d-block">{errors.server}</div>}
          </div>

          <button type="submit" className="btn btn-primary w-100" disabled={loading}>
            {loading ? (
              <span>
                <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                &nbsp;Logging In...
              </span>
            ) : (
              "Login"
            )}
          </button>

          <div className="text-center mt-3">
            <p>Don't have an account? <a href="/register">Register</a></p>
            <a href="/forgot-password">Forgot Password</a>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Login;
