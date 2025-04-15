import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { validateEmail, validatePassword } from "../utils/validationHelper";

const Register = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const { handleRegister } = useAuth();
  const navigate = useNavigate();

  const validateForm = () => {
    const newErrors = {};

    if (!name.trim()) {
      newErrors.name = "Name is required";
    }
    if (!email.trim()) {
      newErrors.email = "Email is required";
    } else {
      const emailError = validateEmail(email);
      if (emailError) {
        newErrors.email = emailError;
      }
    }

    if (!password.trim()) {
      newErrors.password = "Password is required";
    } else {
      const passwordError = validatePassword(password); 
      if (passwordError) {
        newErrors.password = passwordError; 
      }
    }
    
    if (!confirmPassword.trim()) {
      newErrors.confirmPassword = "Confirm password is required";
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return; 

    setLoading(true); 

    try {
      await handleRegister(name, email, password);
      navigate("/login"); 
    } catch (error) {
      console.error("Register failed:", error);

      if (error?.data?.email) {
        setErrors({
          email: error?.data?.email?.message || "Email already exists"
        });
      } else {
        setErrors((prevErrors) => ({
          ...prevErrors,
          server: error?.message || "An unexpected error occurred. Please try again.",
        }));
      }
    } finally {
      setLoading(false); 
    }
  };

  const handleKeyUp = (e) => {
    validateForm();
  };

  return (
    <div className="container mt-5">
      <div className="card p-4 shadow-sm mx-auto" style={{ maxWidth: "400px" }}>
        <h3 className="text-center mb-4">
          <span className="text-luxora">Luxora</span><span className="text-chat">Chat</span>
        </h3>
        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="form-label">Name</label>
            <input
              type="text"
              className={`form-control ${errors.name ? "is-invalid" : ""}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyUp={handleKeyUp}
            />
            {errors.name && <div className="invalid-feedback">{errors.name}</div>}
          </div>

          <div className="mb-3">
            <label className="form-label">Email</label>
            <input
              type="text"
              className={`form-control ${errors.email ? "is-invalid" : ""}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyUp={handleKeyUp}
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
              onKeyUp={handleKeyUp}
            />
            {errors.password && <div className="invalid-feedback">{errors.password}</div>}
          </div>

          <div className="mb-3">
            <label className="form-label">Confirm Password</label>
            <input
              type="password"
              className={`form-control ${errors.confirmPassword ? "is-invalid" : ""}`}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyUp={handleKeyUp}
            />
            {errors.confirmPassword && <div className="invalid-feedback">{errors.confirmPassword}</div>}
          </div>

          {errors.server && <div className="alert alert-danger">{errors.server}</div>}

          <button type="submit" className="btn btn-primary w-100" disabled={loading}>
            {loading ? (
              <span>
                <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                &nbsp;Registering...
              </span>
            ) : (
              "Register"
            )}
          </button>

          <div className="text-center mt-3">
            <p>Already have an account? <a className="text-decoration-none" href="/login">Login</a></p>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Register;