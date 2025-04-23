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

export const setRefreshToken = (token) => {
    localStorage.setItem("refreshToken", token);
};

export const getRefreshToken = () => {
    return localStorage.getItem("refreshToken");
};

export const removeRefreshToken = () => {
    localStorage.removeItem("refreshToken");
};

export const setUser = (user) => {
    localStorage.setItem("user", JSON.stringify(user));
};

export const getUser = () => {
    return JSON.parse(localStorage.getItem("user"));
};

export const removeUser = () => {
    localStorage.removeItem("user");
};