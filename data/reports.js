import { reportsCollection, usersCollection } from "../config/mongoCollections.js";
import { ObjectId, ReturnDocument } from "mongodb";
import { validateReportInput } from '../helpers/reportHelpers.js';

export const createReport = async (userId, stationId, stationName, issueType, description) => {
    const reportData = validateReportInput({ stationId, stationName, issueType, description });
    const reportsCol = await reportsCollection();
    const usersCol = await usersCollection();
    const newReport = {
        userId,
        stationId: reportData.stationId,
        stationName: reportData.stationName,
        issueType: reportData.issueType,
        description: reportData.description,
        createdAt: new Date(),
        updatedAt: new Date(),
        upvotes: 0,
        downvotes: 0,
        netvotes: 0,
    };

    const insertInfo = await reportsCol.insertOne(newReport);
    if(!insertInfo.acknowledged) throw new Error('Failed to insert report');
    const reportId = insertInfo.insertedId;

    //linking report with user
    await usersCol.updateOne(
        { userId},
        {$push: { reports: reportId}}
    );

    return await reportsCol.findOne({ _id: reportId});
};

export const getReportsByUser = async (userId) => {
    const reportsCol = await reportsCollection();
    return await reportsCol.find({userId}).sort({updatedAt: -1}).toArray();
};

export const getReportById = async (reportId) => {
    if(!ObjectId.isValid(reportId)) 
        throw new Error('Invalid report Id');
    const reportsCol = await reportsCollection();
    return await reportsCol.findOne({ _id: new ObjectId(reportId) });
};

export const updateReport = async (reportId, userId, updates) => {

    if(!ObjectId.isValid(reportId)) throw new Error('Invalid report Id');
    const reportsCol = await reportsCollection();
    const updateDoc = {
        ...updates,
        updatedAt: new Date()
    };

    const result = await reports.findOneAndUpdate(
        { _id: new ObjectId(reportId), userId},
        { $set: updateDoc },
        {returnDocument: 'after'}
    );

    if(!result.value)
        throw new Error('Report not found or unauthorized');
    return result.value;
};

export const deleteReport = async (reportId, userId) => {

    if(!ObjectId.isValid(reportId)) throw new Error('Invalid report Id');

    const reportsCol = await reportsCollection();
    const usersCol = await usersCollection();
    const deletion = await reportsCol.deleteOne({ _id: new ObjectId(reportId), userId});
    if (!deletion.deletedCount)
        throw new Error('Report not found or unauthorized');
    await usersCol.updateOne(
        { userId },
        { $pull: { reports: new ObjectId(reportId) } }
    );
};