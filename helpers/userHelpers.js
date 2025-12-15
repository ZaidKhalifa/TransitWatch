import { StatusError } from './helpers.js';
import validator from 'validator';

export const validateString = (str, strName = 'someString') => {
    if(!str)
        throw new StatusError(`${strName} is missing`)
    if(typeof str !== "string")
        throw new StatusError(`${strName} must be a string`)
    str = str.trim();
    if(str.length === 0)
        throw new StatusError(`${strName} may not be empty`);
    return str;
}

export const validateName = (name, strName = 'Name') => {
    name = validateString(name, strName);
    if (!/^[a-zA-Z]+$/.test(name))
        throw new StatusError(`${strName} must contain only letters with no spaces or numbers`);
    if (name.length < 2 || name.length > 20)
        throw new StatusError(`${strName} must be between 2 and 20 characters long`);
    return name;
}

export const validateEmail = (email) => {
    email = validateString(email, "Email id");
    if(!validator.isEmail(email))
        throw new StatusError("Email id not valid");
    return email;
}

export const validateDob = (dob, minAge = 13) => {
    dob = validateString(dob);

    if (!validator.isISO8601(dob))
        throw new StatusError('Invalid date format');

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob))
        throw new StatusError('Date must be in YYYY-MM-DD format');

    dob = new Date(dob);

    if (isNaN(dob.getTime()))
        throw new StatusError('Invalid date');

    let today = new Date();

    const minDate = new Date('1920-01-01');
    if (dob < minDate)
        throw new Error('Date of birth must be after 1920');

    if (dob > today)
        throw new StatusError('Date of birth cannot be in the future');

    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate()))
        age--;

    if (age < minAge)
        throw new StatusError(`You must be at least ${minAge} years old to register`);

    return dob;
}

export const validateUserId = (userId) => {
    userId = validateString(userId, 'User id');
    if (!/^[a-zA-Z0-9]+$/.test(userId))
        throw new StatusError('User id must contain only letters and numbers');
    if (userId.length < 4 || userId.length > 10)
        throw new StatusError('User id must be between 4 and 10 characters long');
    return userId;
};

export const validatePassword = (pass) => {
    if(!pass)
        throw new StatusError('Password is missing')
    if(typeof pass !== "string")
        throw new StatusError('Password must be a string')
    if (/\s/.test(pass))
        throw new StatusError('Password cannot contain spaces');
    if (pass.length < 8)
        throw new StatusError('Password must be at least 8 characters long');
    if (!/[A-Z]/.test(pass))
        throw new StatusError('Password must have an uppercase character');
    if(!/[^A-Za-z0-9]/.test(pass))
        throw new StatusError('Password must have a special character');
    if(!/[0-9]/.test(pass))
        throw new StatusError('Password must have a number');
    return pass;
};

export const getCurrentDate = () => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const year = now.getFullYear();
    return `${month}/${day}/${year}`;
};

export const getCurrentDateTime = () => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const year = now.getFullYear();
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    hours = String(hours).padStart(2, '0');
    return `${month}/${day}/${year} ${hours}:${minutes}${ampm}`;
};

export const getCurrentTime = () => {
    const now = new Date();
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    hours = String(hours).padStart(2, '0');
    return `${hours}:${minutes}${ampm}`;
};