import { reportsCollection, usersCollection, stopsCollection } from '../config/mongoCollections.js';
import { ObjectId } from 'mongodb';
import { parseAndValidateStops, validateIssueType, validateDescription, validateSeverity, validateStatus } from '../helpers/reportHelpers.js';
// username = req.session.user.userId (your login username)
export const createReport = async (
    username,
    stopsRaw,
    issueTypeRaw,
    descriptionRaw,
    severityRaw,
    statusRaw) => { 
        const reportsCol = await reportsCollection();
        const usersCol = await usersCollection();
        const user = await usersCol.findOne({ userId: username });
        if(!user)
            throw new Error('User not found');
        const stops = parseAndValidateStops(stopsRaw);
        const issueType = validateIssueType(issueTypeRaw);
        const description = validateDescription(descriptionRaw);
        const severity = validateSeverity(severityRaw);
        const status = validateStatus(statusRaw || 'active');
        const now = new Date();
        const isResolved = status === 'resolved';
        const newReport = {
            userId: user._id,
            username: username,
            stops,
            issueType,
            severity,
            description,
            upvotes: 0,
            downvotes: 0,
            netVotes: 0,
            voters: [],
            status,
            isResolved,
            createdAt: now,
            updatedAt: now,
            resolvedAt: isResolved ? now : null
        };
        const insertInfo = await reportsCol.insertOne(newReport);
        if(!insertInfo.acknowledged)
            throw new Error('Failed to insert report');
        const reportId = insertInfo.insertedId;
        await usersCol.updateOne(
            { _id: user._id },
            { $push: { reports: reportId } }
        );
        const stopsCol = await stopsCollection();
        const stopIds = stops.map((s) => s.stopId);

        await stopsCol.updateMany(
            { stopId: { $in: stopIds } },
            { $addToSet: { reports: reportId } }
        );
        return await reportsCol.findOne({ _id: reportId });
    };
    
    export const getReportsByUser = async (username) => {
        const reportsCol = await reportsCollection();
        return await reportsCol .find({ username }) .sort({ updatedAt: -1 }) .toArray();
    };
    
    export const getReportById = async (reportId) => {
        if(!ObjectId.isValid(reportId))
            throw new Error('Invalid report id');
        const reportsCol = await reportsCollection();
        return await reportsCol.findOne({ _id: new ObjectId(reportId) });
    };
    
    export const updateReport = async (reportId, username, updatesRaw) => {
        if(!ObjectId.isValid(reportId))
            throw new Error('Invalid report id');
        const reportsCol = await reportsCollection();
        const existing = await reportsCol.findOne({ _id: new ObjectId(reportId), username });
        if(!existing)
            throw new Error('Report not found or unauthorized');
        const updateDoc = {};
        let newStops = null;
        if(updatesRaw.stops){
            newStops = parseAndValidateStops(updatesRaw.stops);
            updateDoc.stops = newStops;
        }
        if(updatesRaw.issueType){
            updateDoc.issueType = validateIssueType(updatesRaw.issueType);
        }
        if(updatesRaw.description){
            updateDoc.description = validateDescription(updatesRaw.description);
        }
        if(updatesRaw.severity){
            updateDoc.severity = validateSeverity(updatesRaw.severity);
        }
        if(updatesRaw.status){
            const status = validateStatus(updatesRaw.status);
            updateDoc.status = status;
            updateDoc.isResolved = status === 'resolved';
            updateDoc.resolvedAt = status === 'resolved' ? new Date() : null;
        }
        updateDoc.updatedAt = new Date();
        const result = await reportsCol.findOneAndUpdate(
            { _id: new ObjectId(reportId), username },
            { $set: updateDoc },
            { returnDocument: 'after' }
        );
        if(!result.value)
            throw new Error('Report update failed');
        if(newStops){
            const stopsCol = await stopsCollection();
            const oldStopIds = (existing.stops || []).map((s) => s.stopId);
            const newStopIds = newStops.map((s) => s.stopId);
            const removed = oldStopIds.filter((id) => !newStopIds.includes(id));
            const added = newStopIds.filter((id) => !oldStopIds.includes(id));
            const reportObjectId = new ObjectId(reportId);

            if(removed.length){
                await stopsCol.updateMany(
                    { stopId: { $in: removed } },
                    { $pull: { reports: reportObjectId } }
                );
            }
            if(added.length){
                await stopsCol.updateMany(
                    { stopId: { $in: added } },
                    { $addToSet: { reports: reportObjectId } }
                );
            }
        }
        return result.value;
    };
    
    export const deleteReport = async (reportId, username) => {
        if(!ObjectId.isValid(reportId))
            throw new Error('Invalid report id');
        const reportsCol = await reportsCollection();
        const usersCol = await usersCollection();
        const reportObjectId = new ObjectId(reportId);
        const report = await reportsCol.findOne({ _id: reportObjectId, username });
        if(!report)
            throw new Error('Report not found or unauthorized');
        const deleteResult = await reportsCol.deleteOne({ _id: reportObjectId, username });
        if(!deleteResult.deletedCount)
            throw new Error('Report delete failed');
        await usersCol.updateOne(
            { _id: report.userId },
            { $pull: { reports: reportObjectId } }
        );
        
        const stopsCol = await stopsCollection();
        const stopIds = (report.stops || []).map((s) => s.stopId);
        if(stopIds.length){
            await stopsCol.updateMany(
                { stopId: { $in: stopIds } },
                { $pull: { reports: reportObjectId } }
            );
        }
    };

// import { reportsCollection, usersCollection } from "../config/mongoCollections.js";
// import { ObjectId, ReturnDocument } from "mongodb";
// import { validateReportInput } from '../helpers/reportHelpers.js';

// export const createReport = async (userId, stationId, stationName, issueType, description) => {
//     const reportData = validateReportInput({ stationId, stationName, issueType, description });
//     const reportsCol = await reportsCollection();
//     const usersCol = await usersCollection();
//     const newReport = {
//         userId,
//         stationId: reportData.stationId,
//         stationName: reportData.stationName,
//         issueType: reportData.issueType,
//         description: reportData.description,
//         createdAt: new Date(),
//         updatedAt: new Date(),
//         upvotes: 0,
//         downvotes: 0,
//         netvotes: 0,
//     };

//     const insertInfo = await reportsCol.insertOne(newReport);
//     if(!insertInfo.acknowledged) throw new Error('Failed to insert report');
//     const reportId = insertInfo.insertedId;

//     //linking report with user
//     await usersCol.updateOne(
//         { userId},
//         {$push: { reports: reportId}}
//     );

//     return await reportsCol.findOne({ _id: reportId});
// };

// export const getReportsByUser = async (userId) => {
//     const reportsCol = await reportsCollection();
//     return await reportsCol.find({userId}).sort({updatedAt: -1}).toArray();
// };

// export const getReportById = async (reportId) => {
//     if(!ObjectId.isValid(reportId)) 
//         throw new Error('Invalid report Id');
//     const reportsCol = await reportsCollection();
//     return await reportsCol.findOne({ _id: new ObjectId(reportId) });
// };

// export const updateReport = async (reportId, userId, updates) => {

//     if(!ObjectId.isValid(reportId)) throw new Error('Invalid report Id');
//     const reportsCol = await reportsCollection();
//     const updateDoc = {
//         ...updates,
//         updatedAt: new Date()
//     };

//     const result = await reports.findOneAndUpdate(
//         { _id: new ObjectId(reportId), userId},
//         { $set: updateDoc },
//         {returnDocument: 'after'}
//     );

//     if(!result.value)
//         throw new Error('Report not found or unauthorized');
//     return result.value;
// };

// export const deleteReport = async (reportId, userId) => {

//     if(!ObjectId.isValid(reportId)) throw new Error('Invalid report Id');

//     const reportsCol = await reportsCollection();
//     const usersCol = await usersCollection();
//     const deletion = await reportsCol.deleteOne({ _id: new ObjectId(reportId), userId});
//     if (!deletion.deletedCount)
//         throw new Error('Report not found or unauthorized');
//     await usersCol.updateOne(
//         { userId },
//         { $pull: { reports: new ObjectId(reportId) } }
//     );
// };