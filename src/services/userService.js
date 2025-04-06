import { getAuthToken } from "../utils/authHelper";
import { getResponse } from "../utils/responseHelper";

export const updateUserOnlineStatus = async (userId, isOnline) => {
    // Don't attempt to update if no userId is provided
    if (!userId) {
        console.log("Cannot update online status: No user ID provided");
        return { success: false, error: "No user ID provided" };
    }
    
    try {
        // Set a timeout for this request to prevent hanging
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
        
        const response = await getResponse(
            "user/update-online-status", 
            "post", 
            JSON.stringify({ userId, isOnline }), 
            {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${getAuthToken()}`,
            },
            controller.signal
        );
        
        clearTimeout(timeoutId);
        
        const data = await response.json();

        if (!response.ok) {
            console.warn("Non-OK response when updating online status:", response.status);
            return { success: false, error: data };
        }

        return { success: true, data };
    } catch (error) {
        // Handle network errors gracefully
        if (error.name === 'AbortError') {
            console.warn("Online status update timed out");
            return { success: false, error: "Request timed out" };
        }
        
        if (error instanceof TypeError && error.message.includes('fetch')) {
            console.warn("Network error when updating online status: Server might be down");
            return { success: false, error: "Network error" };
        }
        
        console.error("Error updating online status:", error);
        return { success: false, error };
    }    
}