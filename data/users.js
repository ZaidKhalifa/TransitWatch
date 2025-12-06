import { usersCollection } from '../config/mongoCollections.js';
import bcrypt from 'bcrypt';
import * as helpers from '../helpers/userHelpers.js';
import { StatusError } from '../helpers/helpers.js';
import validator from 'validator';

const saltRounds = 16;

export const register = async (
  firstName,
  lastName,
  email,
  userId,
  dob,
  password,
) => {
    firstName = helpers.validateName(firstName);
    lastName = helpers.validateName(lastName);
    userId = helpers.validateUserId(userId);
    password = helpers.validatePassword(password);
    dob = helpers.validateDob(dob);
    email = helpers.validateEmail(email);

    const users = await usersCollection();
    const existingUser = await users.findOne({ userId: userId },{ collation: { locale: 'en', strength: 2 } });
    if(existingUser) 
        throw new StatusError('There is already a user with that user id')

    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const newUser = {
        firstName,
        lastName,
        userId,
        email,
        password: hashedPassword,
        dob,
        preferences: {notifications:false, theme:"dark"},
        signupDate: helpers.getCurrentDate(),
        lastLogin: null,
        savedCommutes: [],
        reports: [],
        upvotedReports: [],
        downvotedReports: []
    };

    const insertInfo = await users.insertOne(newUser);
    if (!insertInfo.acknowledged || !insertInfo.insertedId)
        throw new StatusError('Could not add user', 500);

    return { registrationCompleted: true };
};

export const login = async (userId, password) => {
    userId = helpers.validateUserId(userId);
    password = helpers.validatePassword(password);

    const users = await usersCollection();

    const user = await users.findOne({ userId: userId },{ collation: { locale: 'en', strength: 2 } });

    if(!user) 
        throw new StatusError('Either the userId or password is invalid');

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch)
        throw new StatusError('Either the userId or password is invalid');

    const lastLogin = helpers.getCurrentDateTime();
    await users.updateOne({ userId: user.userId }, { $set: { lastLogin: lastLogin } });

    return {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        userId: user.userId,
        preferences: user.preferences,
        signupDate: user.signupDate,
        lastLogin: lastLogin
    };
};