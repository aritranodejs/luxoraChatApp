// Get API_URL from env or use fallback
const API_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000/api';

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