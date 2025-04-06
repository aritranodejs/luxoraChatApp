import { getResponse } from "../utils/responseHelper";
import { getAuthToken } from "../utils/authHelper";

export async function getChats(friendSlug) {
    try {
        console.log("⭐️ Fetching chats for friend slug:", friendSlug);
        const response = await getResponse("user/chats/get-chats?friendSlug=" + friendSlug, "GET", null, {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${getAuthToken()}`,
        });
        const data = await response.json();
        console.log("⭐️ Raw API response in chatService:", data);

        if (!response.ok) {
            console.error("⭐️ API error in getChats:", data);
            throw data;
        }

        return data;
    } catch (error) {
        console.error("⭐️ Exception in getChats:", error);
        throw error;
    }
}

export async function sendMessages(friendSlug, content) {
    try {
        console.log("⭐️ Sending message to friend slug:", friendSlug, "Content:", content);
        const response = await getResponse("user/chats/send-message", "POST", JSON.stringify({ friendSlug, content }), {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${getAuthToken()}`,
        });
        const data = await response.json();
        console.log("⭐️ Message sent response:", data);

        if (!response.ok) {
            console.error("⭐️ API error in sendMessages:", data);
            throw data;
        }

        return data;
    } catch (error) {
        console.error("⭐️ Exception in sendMessages:", error);
        throw error;
    }
}