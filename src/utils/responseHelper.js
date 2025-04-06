const API_URL = process.env.REACT_APP_API_BASE_URL;

export async function getResponse(endpoint, method, body, headers) {
    try {
        console.log(`⭐️ API Request: ${method} ${API_URL}/${endpoint}`);
        if (body) console.log("⭐️ Request body:", body);
        
        const response = await fetch(`${API_URL}/${endpoint}`, {
            method: method,
            headers: headers,
            body: body
        });
        
        console.log(`⭐️ API Response status: ${response.status} ${response.statusText}`);
        return response;
    } catch (error) {
        console.error("⭐️ API Request failed:", error);
        throw error;
    }
}