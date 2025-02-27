export const validateEmail = (email) => {
    const re = /\S+@\S+\.\S+/;
    return re.test(email) ? "" : "Enter a valid email address";
};

export const validatePassword = (password) => {
    const re = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (re.test(password)) {
        return "";
    }

    return "Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character";
};
