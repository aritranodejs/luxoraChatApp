import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function Otp() {
  const [otp, setOtp] = useState("");
  const [errors, setErrors] = useState({});
  const [timer, setTimer] = useState(30);
  const [isResendDisabled, setIsResendDisabled] = useState(false);
  const [loading, setLoading] = useState(false); 
  const { handleSendOtp, handleVerifyOtp } = useAuth();
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

  const handleResendOtp = async () => {
    if (isResendDisabled) return;

    try {
      await handleSendOtp();
      setIsResendDisabled(true);
    } catch (error) {
      console.error("OTP Resend failed:", error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateOtp()) return;

    setLoading(true); 

    try {
      await handleVerifyOtp(otp);
      navigate("/chat");
    } catch (error) {
      console.error("OTP Verification failed:", error);
      setErrors((prevErrors) => ({
        ...prevErrors,
        server: error?.message || "An unexpected error occurred. Please try again.",
      }));
    } finally {
      setLoading(false); 
    }
  };

  const handleOtpChange = (e) => {
    setOtp(e.target.value);
    validateOtp();
  };

  useEffect(() => {
    let interval;
    if (isResendDisabled) {
      interval = setInterval(() => {
        setTimer((prevTimer) => {
          if (prevTimer === 1) {
            clearInterval(interval);
            setIsResendDisabled(false);
            return 30;
          }
          return prevTimer - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isResendDisabled]);

  return (
    <div className="container mt-5">
      <div className="card p-4 shadow-sm mx-auto" style={{ maxWidth: "400px" }}>
        <h3 className="text-center mb-4">
          <span className="text-luxora">Luxora</span><span className="text-chat">Chat</span>
        </h3>
        <h3 className="text-center">Verify OTP</h3>
        <div className="mb-3 text-center">
          <small className="text-muted">Two-factor authentication to secure your account</small>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="form-label"><small>Enter the OTP sent to your email</small></label>
            <input
              type="text"
              className={`form-control ${errors.otp ? "is-invalid" : ""}`}
              value={otp}
              onChange={handleOtpChange}
              onKeyUp={validateOtp}
            />
            {errors.otp && <div className="invalid-feedback">{errors.otp}</div>}
          </div>
          <div className="mb-3">
            {errors.server && <div className="invalid-feedback d-block">{errors.server}</div>}
          </div>
          <div className="mb-3">
            <button
              type="button"
              className="btn btn-link p-0 text-decoration-none align-baseline"
              onClick={handleResendOtp}
              disabled={isResendDisabled}
            >
              {isResendDisabled ? `Resend OTP in ${timer}s` : "Resend OTP"}
            </button>
          </div>
          <div className="mb-3 text-center">
            <small>OTP is valid for 10 minutes</small>
          </div>
          <div className="mb-3 text-center">
            <small>Didn't receive OTP? Check your spam folder</small>
          </div>
          <button type="submit" className="btn btn-primary w-100" disabled={loading}>
            {loading ? (
              <span>
                <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                &nbsp;Verifying OTP...
              </span>
            ) : (
              "Submit"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Otp;
