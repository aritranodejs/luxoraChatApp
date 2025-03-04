import { getAuthToken } from "../utils/authHelper";
import { getResponse } from "../utils/responseHelper";

export const updateUserOnlineStatus = async (userId, isOnline) => {
    try {
        const response = await getResponse("user/update-online-status", "post", JSON.stringify({ userId, isOnline }), {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${getAuthToken()}`,
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