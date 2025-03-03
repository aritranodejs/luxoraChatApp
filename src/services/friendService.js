import { getResponse } from "../utils/responseHelper";
import { getAuthToken, getUser } from "../utils/authHelper";

export async function globalUsers() {
    try {
        const id = getUser().id;
        const response = await getResponse("user/global-users?id=" + id, "GET", null, {
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

export async function friends() {
    try {
        const response = await getResponse("user/friends", "get", null, {
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

export async function addFriend(receiverId) {
    try {
        const response = await getResponse("user/send-request", "post", JSON.stringify({ receiverId }), {
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