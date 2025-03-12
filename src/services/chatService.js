import { getResponse } from "../utils/responseHelper";
import { getAuthToken } from "../utils/authHelper";

export async function getChats(friendSlug) {
    try {
        const response = await getResponse("user/chats/get-chats?friendSlug=" + friendSlug, "GET", null, {
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

export async function sendMessages(friendSlug, content) {
    try {
        const response = await getResponse("user/chats/send-message", "POST", JSON.stringify({ friendSlug, content }), {
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