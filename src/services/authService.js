import { getResponse } from "../utils/responseHelper";
import { getAccessToken, getRefreshToken } from "../utils/authHelper";

export async function register(name, email, password) {
    try {
        const response = await getResponse("auth/register", "POST", JSON.stringify({ name, email, password }), {
            "Content-Type": "application/json",
        });
        const data = await response.json();

        if (!response.ok) {
            throw data;
        }

        return data;
    } catch (error) {
        throw error; 
    }
}

export async function login(email, password) {
    try {
        const response = await getResponse("auth/login", "POST", JSON.stringify({ email, password }), {
            "Content-Type": "application/json",
        });
        const data = await response.json();

        if (!response.ok) {
            throw data;
        }

        return data;
    } catch (error) {
        throw error;
    }
}

export async function sendOtp(email) {
    try {
        const response = await getResponse("auth/send-otp", "POST", JSON.stringify({ email }), {
            "Content-Type": "application/json",
        });
        const data = await response.json();

        if (!response.ok) {
            throw data;
        }

        return data;
    } catch (error) {
        throw error; 
    }
}

export async function verifyOtp(email, otp) {
    try {
        const response = await getResponse("auth/verify-otp", "POST", JSON.stringify({ email, otp }), {
            "Content-Type": "application/json",
        });
        const data = await response.json();

        if (!response.ok) {
            throw data;
        }

        return data;
    } catch (error) {
        throw error; 
    }
}

export async function me() {
    try {
        const response = await getResponse("auth/me", "GET", null, {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${getAccessToken()}`,
        });
        const data = await response.json();

        if (!response.ok) {
            throw data;
        }

        return data;
    } catch (error) {
        console.error("Me error:", error);
        throw error; // Re-throw the error
    }
}

export async function refreshToken() {
    try {
        const refreshToken = getRefreshToken();
        if (!refreshToken) {
            throw new Error("No refresh token available");
        }

        const response = await getResponse("auth/refresh", "POST", null, {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${refreshToken}`,
        });
        const data = await response.json();

        if (!response.ok) {
            throw data;
        }

        return data;
    } catch (error) {
        console.error("Refresh token error:", error);
        throw error;
    }
}

export async function logout() {
    try {
        const response = await getResponse("auth/logout", "DELETE", null, {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${getAccessToken()}`,
        });
        const data = await response.json();

        if (!response.ok) {
            throw data;
        }

        return data;
    } catch (error) {
        throw error; // Re-throw the error
    }
}