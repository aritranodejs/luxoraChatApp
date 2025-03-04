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
        const response = await getResponse("user/friends?status=accepted", "get", null, {
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

export async function getPendingRequests() {
    try {
        const response = await getResponse("user/friends?status=pending", "get", null, {
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
        const response = await getResponse("user/friends/send-request", "post", JSON.stringify({ receiverId }), {
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

export async function getFriendRequests() {
    try {
        const response = await getResponse("user/friends/get-friend-requests", "GET", null, {
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

export async function acceptOrRejectRequest(friendId, status) {
    try {
        const response = await getResponse("user/friends/accept-or-reject", "post", JSON.stringify({ friendId, status }), {
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

export async function cancelRequest(friendId) {
    try {
        const response = await getResponse("user/friends/cancel-request", "DELETE", JSON.stringify({ friendId }), {
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