import { reportsCollection, usersCollection, stopsCollection } from "../config/mongoCollections.js";
import { ObjectId } from "mongodb";
import { validateReportInput } from "../helpers/reportHelpers.js";

function toObjectId(id, name = "id") {
  if (!id) throw new Error(`${name} is required`);
  if (id instanceof ObjectId) return id;
  if (!ObjectId.isValid(id)) throw new Error(`Invalid ${name}`);
  return new ObjectId(id);
}

export const createReport = async (userId, stationId, stationName, issueType, description) => {
  const reportData = validateReportInput({ stationId, stationName, issueType, description });

  const reportsCol = await reportsCollection();
  const usersCol = await usersCollection();
  const uid = toObjectId(userId, "userId");

  const newReport = {
    userId: uid,
    stationId: reportData.stationId,
    stationName: reportData.stationName,
    issueType: reportData.issueType,
    description: reportData.description,
    createdAt: new Date(),
    updatedAt: new Date(),
    upvoters: [],
    downvoters: [],
    upvotes: 0,
    downvotes: 0,
    netvotes: 0,
  };

  const insertInfo = await reportsCol.insertOne(newReport);
  if (!insertInfo.acknowledged) throw new Error("Failed to insert report");

  const reportId = insertInfo.insertedId;

  await usersCol.updateOne(
    { _id: uid },
    { $addToSet: { reports: reportId } }
  );

  try {
    const stopsCol = await stopsCollection();
    await stopsCol.updateOne(
      { stop_id: reportData.stationId },
      { $addToSet: { reports: reportId } }
    );
  } catch (e) {}

  return await reportsCol.findOne({ _id: reportId });
};

export const getReportsByUser = async (userId) => {
  const reportsCol = await reportsCollection();
  const uid = toObjectId(userId, "userId");
  return await reportsCol.find({ userId: uid }).sort({ updatedAt: -1 }).toArray();
};

export const getReportById = async (reportId) => {
  const rid = toObjectId(reportId, "reportId");
  const reportsCol = await reportsCollection();
  return await reportsCol.findOne({ _id: rid });
};

export const getReportsByStation = async (stationId) => {
  if (!stationId) throw new Error("stationId is required");
  const reportsCol = await reportsCollection();

  const list = await reportsCol
    .find({ stationId })
    .sort({ updatedAt: -1 })
    .toArray();

  const nonNeg = list
    .filter(r => (r.netvotes ?? 0) >= 0)
    .sort((a, b) => (b.netvotes - a.netvotes) || (b.updatedAt - a.updatedAt));

  const neg = list
    .filter(r => (r.netvotes ?? 0) < 0)
    .sort((a, b) => (b.netvotes - a.netvotes) || (b.updatedAt - a.updatedAt));

  return [...nonNeg, ...neg];
};

export const updateReport = async (reportId, userId, updates) => {
  const rid = toObjectId(reportId, "reportId");
  const uid = toObjectId(userId, "userId");
  const reportsCol = await reportsCollection();

  const allowed = {};
  if (updates.stationName) allowed.stationName = updates.stationName;
  if (updates.issueType) allowed.issueType = updates.issueType;
  if (updates.description) allowed.description = updates.description;

  const updateDoc = {
    ...allowed,
    updatedAt: new Date(),
  };

  const result = await reportsCol.findOneAndUpdate(
    { _id: rid, userId: uid },
    { $set: updateDoc },
    { returnDocument: "after" }
  );

  if (!result.value) throw new Error("Report not found or unauthorized");
  return result.value;
};

export const deleteReport = async (reportId, userId) => {
  const rid = toObjectId(reportId, "reportId");
  const uid = toObjectId(userId, "userId");

  const reportsCol = await reportsCollection();
  const usersCol = await usersCollection();

  const deletion = await reportsCol.deleteOne({ _id: rid, userId: uid });
  if (!deletion.deletedCount) throw new Error("Report not found or unauthorized");

  await usersCol.updateOne(
    { _id: uid },
    { $pull: { reports: rid } }
  );

  try {
    const stopsCol = await stopsCollection();
    await stopsCol.updateOne(
      { reports: rid },
      { $pull: { reports: rid } }
    );
  } catch (e) {}

  return { deleted: true };
};

export const voteReport = async (reportId, voterId, type) => {
  const rid = toObjectId(reportId, "reportId");
  const vid = toObjectId(voterId, "voterId");

  const t = (type || "").toLowerCase().trim();
  if (t !== "up" && t !== "down") throw new Error("type must be 'up' or 'down'");

  const reportsCol = await reportsCollection();
  const report = await reportsCol.findOne({ _id: rid });
  if (!report) throw new Error("Report not found");

  const upSet = new Set((report.upvoters || []).map(x => x.toString()));
  const downSet = new Set((report.downvoters || []).map(x => x.toString()));
  const me = vid.toString();

  const hasUp = upSet.has(me);
  const hasDown = downSet.has(me);

  if (t === "up" && hasUp) throw new Error("You already upvoted this report");
  if (t === "down" && hasDown) throw new Error("You already downvoted this report");

  const update = { $set: { updatedAt: new Date() } };

  if (t === "up") {
    update.$addToSet = { upvoters: vid };
    update.$pull = { downvoters: vid };
    update.$inc = hasDown
      ? { upvotes: 1, downvotes: -1, netvotes: 2 }
      : { upvotes: 1, netvotes: 1 };
  } else {
    update.$addToSet = { downvoters: vid };
    update.$pull = { upvoters: vid };
    update.$inc = hasUp
      ? { downvotes: 1, upvotes: -1, netvotes: -2 }
      : { downvotes: 1, netvotes: -1 };
  }

  await reportsCol.updateOne({ _id: rid }, update);

  const updated = await reportsCol.findOne({ _id: rid });
  return {
    reportId: updated._id.toString(),
    upvotes: updated.upvotes,
    downvotes: updated.downvotes,
    netvotes: updated.netvotes,
  };
};
