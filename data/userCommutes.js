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
            userId: userId,
            'savedCommutes._id': commuteObjectId
        },
        {
            projection: {
                'savedCommutes.$': 1 // Only return the matching commute
            },
            collation: { locale: 'en', strength: 2 }
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
        { userId: userId },
        { 
            projection: { savedCommutes: 1 },
            collation: { locale: 'en', strength: 2 } 
        }
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
        { userId: userId },
        { $push: { savedCommutes: newCommute } },
        { collation: { locale: 'en', strength: 2 } }
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
            userId: userId,
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
        { userId: userId },
        { $pull: { savedCommutes: { _id: commuteObjectId } } },
        { collation: { locale: 'en', strength: 2 } }
    );
    
    if (result.modifiedCount === 0) {
        throw new Error('Failed to delete commute');
    }
};

/**
 * Update an existing commute
 * 
 * @param {string} userId - User's ID from session
 * @param {string|ObjectId} commuteId - The commute's ObjectId
 * @param {Object} commuteData - Updated commute data { name, legs }
 * @returns {Object} The updated commute
 */
export const updateCommute = async (userId, commuteId, commuteData) => {
    const commuteObjectId = typeof commuteId === 'string' ? new ObjectId(commuteId) : commuteId;
    
    // Validate name
    if (!commuteData.name || typeof commuteData.name !== 'string' || commuteData.name.trim().length === 0) {
        throw new StatusError("The commute name must not be empty");
    }
    const name = commuteData.name.trim();
    if (!/^[a-zA-Z0-9\s_-]+$/.test(name)) {
        throw new StatusError("The commute name can only have letters, numbers, spaces, hyphens and underscores");
    }
    
    const users = await usersCollection();
    
    // First verify the commute exists and belongs to user
    const existing = await users.findOne(
        { 
            userId: userId,
            'savedCommutes._id': commuteObjectId
        },
        { collation: { locale: 'en', strength: 2 } }
    );
    
    if (!existing) {
        throw new StatusError('Commute not found', 404);
    }
    
    // Update the commute
    const result = await users.updateOne(
        { 
            userId: userId,
            'savedCommutes._id': commuteObjectId
        },
        {
            $set: {
                'savedCommutes.$.name': name,
                'savedCommutes.$.legs': commuteData.legs,
                'savedCommutes.$.lastUsed': new Date()
            }
        },
        { collation: { locale: 'en', strength: 2 } }
    );
    
    if (result.modifiedCount === 0) {
        throw new StatusError('Failed to update commute', 500);
    }
    
    return { _id: commuteObjectId, name, legs: commuteData.legs };
};