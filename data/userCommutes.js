import { usersCollection } from '../config/mongoCollections.js';
import { ObjectId } from 'mongodb';
import { StatusError } from '../helpers/helpers.js';

/**
 * Get a specific commute by userId and commuteId
 * 
 * @param {string} userId - User's ID from session
 * @param {string|ObjectId} commuteId - The commute's ObjectId
 * @returns {Object} The commute object
 * @throws {Error} If user or commute not found
 */
export const getCommuteById = async (userId, commuteId) => {
    if (!commuteId) {
        throw new Error('Invalid commuteId');
    }
    
    // Convert commuteId to ObjectId if it's a string
    const commuteObjectId = typeof commuteId === 'string' ? new ObjectId(commuteId) : commuteId;
    
    const users = await usersCollection();
    const user = await users.findOne(
        { 
            _id: new ObjectId(userId),
            'savedCommutes._id': commuteObjectId
        },
        {
            projection: {
                'savedCommutes.$': 1 // Only return the matching commute
            }
        }
    );
    
    if (!user || !user.savedCommutes || user.savedCommutes.length === 0) {
        throw new Error('Commute not found');
    }
    
    return user.savedCommutes[0];
};

/**
 * Get all commutes for a user
 * 
 * @param {string} userId - User's ID from session
 * @returns {Array} Array of commute objects
 */
export const getUserCommutes = async (userId) => {
    const users = await usersCollection();
    const user = await users.findOne(
        { _id: new ObjectId(userId) },
        { projection: { savedCommutes: 1 } }
    );
    
    if (!user) {
        throw new Error('User not found');
    }
    
    return user.savedCommutes || [];
};

/**
 * Add a new commute for a user
 * 
 * @param {string} userId - User's ID from session
 * @param {Object} commuteData - The commute object to add
 * @returns {Object} The created commute with its new _id
 */
export const addCommute = async (userId, commuteData) => {
    if(!commuteData.name || typeof commuteData.name !== 'string' || commuteData.name.trim().length === 0)
            throw new StatusError("The commute name must not be empty");
    const name = commuteData.name.trim();
    if(!/^[a-zA-Z0-9\s_-]+$/.test(name))
        throw new StatusError("The commute name can only have letters, numbers, spaces, hyphens and underscores");
    
    // Create new commute with _id
    const newCommute = {
        _id: new ObjectId(),
        name: name,
        createdAt: new Date(),
        lastUsed: new Date(),
        legs: commuteData.legs // Already validated
    };
    
    const users = await usersCollection();
    const result = await users.updateOne(
        { _id: new ObjectId(userId) },
        { $push: { savedCommutes: newCommute } }
    );
    
    if (result.modifiedCount === 0) {
        throw new StatusError('Failed to add commute', 500);
    }
    
    return newCommute;
};

/**
 * Update lastUsed timestamp for a commute
 * 
 * @param {string} userId - User's ID from session
 * @param {string|ObjectId} commuteId - The commute's ObjectId
 */
export const updateCommuteLastUsed = async (userId, commuteId) => {
    const commuteObjectId = typeof commuteId === 'string' ? new ObjectId(commuteId) : commuteId;
    
    const users = await usersCollection();
    await users.updateOne(
        { 
            _id: new ObjectId(userId),
            'savedCommutes._id': commuteObjectId
        },
        {
            $set: { 'savedCommutes.$.lastUsed': new Date() }
        }
    );
};

/**
 * Delete a commute
 * 
 * @param {string} userId - User's ID from session
 * @param {string|ObjectId} commuteId - The commute's ObjectId
 */
export const deleteCommute = async (userId, commuteId) => {
    const commuteObjectId = typeof commuteId === 'string' ? new ObjectId(commuteId) : commuteId;
    
    const users = await usersCollection();
    const result = await users.updateOne(
        { _id: new ObjectId(userId) },
        { $pull: { savedCommutes: { _id: commuteObjectId } } }
    );
    
    if (result.modifiedCount === 0) {
        throw new Error('Failed to delete commute');
    }
};