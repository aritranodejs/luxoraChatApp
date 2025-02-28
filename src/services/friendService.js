import { getResponse } from "../utils/responseHelper";

export async function friends() {
    try {
        const response = await getResponse("auth/register", "POST", null, {
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