import { setAccessToken, removeAccessToken, getRefreshToken, removeRefreshToken } from "./authHelper";

// Get API_URL from env or use fallback
const API_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000/api';

// Track if we're already refreshing to prevent infinite loops
let isRefreshing = false;
// Store callbacks to retry original requests
let failedQueue = [];

const processQueue = (error, token = null) => {
    failedQueue.forEach(prom => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve(token);
        }
    });
    failedQueue = [];
};

export async function refreshAccessToken() {
    try {
        // Call the refresh token endpoint
        const response = await fetch(`${API_URL}/auth/refresh`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getRefreshToken()}`
            },
            body: JSON.stringify({
                refreshToken: getRefreshToken()
            })
        });

        if (!response.ok) {
            throw new Error('Token refresh failed');
        }

        const data = await response.json();
        
        // Update tokens in storage
        setAccessToken(data.data.accessToken);
        
        return data.data.accessToken;
    } catch (error) {
        // Clear auth data on refresh failure
        removeAccessToken();
        removeRefreshToken();
        throw error;
    }
}

export async function getResponse(endpoint, method, body, headers, signal) {
    try {
        console.log(` API Request: ${method} ${API_URL}/${endpoint}`);
        if (body) console.log(" Request body:", body);
        
        // Add safety check for API_URL
        if (!API_URL) {
            console.error(" API_URL is not defined. Check your .env file");
            throw new Error("API URL is not configured properly");
        }
        
        // Ensure endpoint doesn't start with a slash if API_URL ends with one
        const formattedEndpoint = endpoint.startsWith('/') && API_URL.endsWith('/') 
            ? endpoint.substring(1) 
            : endpoint;
            
        const response = await fetch(`${API_URL}/${formattedEndpoint}`, {
            method: method,
            headers: headers,
            body: body,
            signal: signal // Add AbortSignal support
        });
        
        console.log(` API Response status: ${response.status} ${response.statusText}`);
        
        // Handle token expiration
        if (response.status === 401 && getRefreshToken() && !endpoint.includes('auth/refresh')) {
            // If we are not already refreshing, initiate token refresh
            if (!isRefreshing) {
                isRefreshing = true;
                try {
                    const newToken = await refreshAccessToken();
                    isRefreshing = false;
                    
                    // Resolve all queued requests with the new token
                    processQueue(null, newToken);
                    
                    // Retry the original request with the new token
                    headers.Authorization = `Bearer ${newToken}`;
                    return getResponse(endpoint, method, body, headers, signal);
                } catch (error) {
                    isRefreshing = false;
                    processQueue(error, null);
                    // Propagate the error
                    throw error;
                }
            } else {
                // If already refreshing, queue this request
                return new Promise((resolve, reject) => {
                    failedQueue.push({ resolve, reject });
                }).then(newToken => {
                    headers.Authorization = `Bearer ${newToken}`;
                    return getResponse(endpoint, method, body, headers, signal);
                }).catch(err => {
                    throw err;
                });
            }
        }
        
        return response;
    } catch (error) {
        console.error(" API Request failed:", error);
        
        // If the server is down or unreachable, provide a clearer error
        if (error instanceof TypeError && error.message.includes('fetch')) {
            console.error(" Server may be down or unreachable. Check server status and network connection.");
        }
        
        throw error;
    }
}