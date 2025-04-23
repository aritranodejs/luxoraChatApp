export const setEmail = (email) => {
    localStorage.setItem("email", email);
};

export const getEmail = () => {
    return localStorage.getItem("email");
};

export const removeEmail = () => {
    localStorage.removeItem("email");
};

export const setAccessToken = (token) => {
    localStorage.setItem("accessToken", token);
};

export const getAccessToken = () => {
    return localStorage.getItem("accessToken");
};

export const removeAccessToken = () => {
    localStorage.removeItem("accessToken");
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