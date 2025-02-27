const API_URL = process.env.REACT_APP_API_BASE_URL;

export async function getResponse(endpoint, method, body, headers) {
    try {
        const response = await fetch(`${API_URL}/${endpoint}`, {
            method: method,
            headers: headers,
            body: body
        });
        
        return response;
    } catch (error) {
        console.error(error);
    }
}