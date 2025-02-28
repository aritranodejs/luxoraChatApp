export const setEmail = (email) => {
    localStorage.setItem("email", email);
};

export const getEmail = () => {
    return localStorage.getItem("email");
};

export const removeEmail = () => {
    localStorage.removeItem("email");
};

export const setAuthToken = (token) => {
    localStorage.setItem("authToken", token);
};

export const getAuthToken = () => {
    return localStorage.getItem("authToken");
};

export const removeAuthToken = () => {
    localStorage.removeItem("authToken");
};
