import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function Otp() {
  const [otp, setOtp] = useState("");
  const [errors, setErrors] = useState({});
  const { handleVerifyOtp } = useAuth();
  const navigate = useNavigate();

  const validateOtp = () => {
    const newErrors = {};

    if (!otp.trim()) {
      newErrors.otp = "OTP is required.";
    } else if (!/^\d{6}$/.test(otp)) {
      newErrors.otp = "OTP must be a 6-digit number.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateOtp()) return; 

    try {
      await handleVerifyOtp(otp);
      navigate("/chat");
    } catch (error) {
      console.error("OTP Verification failed:", error);
      setErrors((prevErrors) => ({
        ...prevErrors,
        server: error?.message || "An unexpected error occurred. Please try again.",
      }));
    }
  };

  return (
    <div className="container mt-5">
      <div className="card p-4 shadow-sm mx-auto" style={{ maxWidth: "400px" }}>
        <h3 className="text-center">Verify OTP</h3>
        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="form-label">Enter 6 digit OTP</label>
            <input
              type="text"
              className={`form-control ${errors.otp ? "is-invalid" : ""}`}
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              required
            />
            {errors.otp && <div className="invalid-feedback">{errors.otp}</div>}
          </div>
          <div className="mb-3">
            {errors.server && <div className="invalid-feedback d-block">{errors.server}</div>}
          </div>
          <div className="mb-3">
            <button type="button" className="btn btn-link p-0 text-decoration-none align-baseline">
              Resend OTP
            </button>
          </div>
          <div className="mb-3 text-center">
            <small>OTP is valid for 10 minutes</small>
          </div>
          <div className="mb-3 text-center">
            <small>Didn't receive OTP? Check your spam folder</small>
          </div>
          <button type="submit" className="btn btn-primary w-100">
            Submit
          </button>
        </form>
      </div>
    </div>
  );
}

export default Otp;
