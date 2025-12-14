import { usersCollection } from '../config/mongoCollections.js';
import bcrypt from 'bcrypt';
import * as helpers from '../helpers/userHelpers.js';
import { StatusError } from '../helpers/helpers.js';
import validator from 'validator';
import { ObjectId } from 'mongodb';

const saltRounds = 16;

/* ================================
   AUTH FUNCTIONS
================================ */

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

    const existingUser = await users.findOne(
        { userId },
        { collation: { locale: 'en', strength: 2 } }
    );

    if (existingUser)
        throw new StatusError('There is already a user with that user id');

    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const newUser = {
        firstName,
        lastName,
        userId,
        email,
        password: hashedPassword,
        dob,
        preferences: { notifications: false, theme: "dark" },
        signupDate: helpers.getCurrentDate(),
        lastLogin: null,
        savedCommutes: [],
        reports: [],
        upvotedReports: [],
        downvotedReports: []
    };

    const insertInfo = await users.insertOne(newUser);
    if (!insertInfo.acknowledged)
        throw new StatusError('Could not add user', 500);

    return { registrationCompleted: true };
};

export const login = async (userId, password) => {
    userId = helpers.validateUserId(userId);
    password = helpers.validatePassword(password);

    const users = await usersCollection();

    const user = await users.findOne(
        { userId },
        { collation: { locale: 'en', strength: 2 } }
    );

    if (!user)
        throw new StatusError('Either the userId or password is invalid');

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch)
        throw new StatusError('Either the userId or password is invalid');

    const lastLogin = helpers.getCurrentDateTime();
    await users.updateOne(
        { userId: user.userId },
        { $set: { lastLogin } }
    );

    return {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        userId: user.userId,
        preferences: user.preferences,
        signupDate: user.signupDate,
        lastLogin
    };
};

/* ================================
   COMMUTE FUNCTIONS
================================ */

export const addCommute = async (userId, commute) => {
    userId = helpers.validateUserId(userId);

    const users = await usersCollection();

    commute._id = new ObjectId();
    commute.createdAt = new Date();
    commute.lastUsed = null;

    const result = await users.updateOne(
        { userId },
        { $push: { savedCommutes: commute } }
    );

    if (result.modifiedCount === 0)
        throw new StatusError('Failed to add commute', 500);

    return commute;
};

export const getUserCommutes = async (userId) => {
    userId = helpers.validateUserId(userId);

    const users = await usersCollection();
    const user = await users.findOne(
        { userId },
        { projection: { savedCommutes: 1 } }
    );

    if (!user) throw new StatusError('User not found', 404);

    return user.savedCommutes || [];
};

export const getCommuteById = async (userId, commuteId) => {
    userId = helpers.validateUserId(userId);

    const users = await usersCollection();
    const user = await users.findOne({ userId });

    if (!user) throw new StatusError('User not found', 404);

    const commute = user.savedCommutes?.find(
        c => c._id.toString() === commuteId
    );

    if (!commute) throw new StatusError('Commute not found', 404);

    return commute;
};

export const updateCommuteLastUsed = async (userId, commuteId) => {
    userId = helpers.validateUserId(userId);

    const users = await usersCollection();

    await users.updateOne(
        { userId, 'savedCommutes._id': new ObjectId(commuteId) },
        { $set: { 'savedCommutes.$.lastUsed': new Date() } }
    );
};

export const deleteCommute = async (userId, commuteId) => {
    userId = helpers.validateUserId(userId);

    const users = await usersCollection();

    const result = await users.updateOne(
        { userId },
        { $pull: { savedCommutes: { _id: new ObjectId(commuteId) } } }
    );

    if (result.modifiedCount === 0)
        throw new StatusError('Failed to delete commute', 500);

    return true;
};
