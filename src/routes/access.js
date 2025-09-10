import { Router } from "express";
import mongoose from "mongoose";
import { requireAuth, requireRole } from "../middleware/auth.js";
import AccessGrant from "../models/AccessGrant.js";

const r = Router();

const isId = (v) => mongoose.Types.ObjectId.isValid(v);

/**
 * POST /access/grant
 * Body: { userId, divisionId, screenIds: [screenId...] }
 * Upserts a grant document and REPLACES its screens with screenIds.
 * Requires: superadmin
 */
r.post("/grant", requireAuth, requireRole(["superadmin"]), async (req, res) => {
  const { userId, divisionId, screenIds } = req.body || {};
  if (!isId(userId) || !isId(divisionId) || !Array.isArray(screenIds)) {
    return res.status(400).json({ message: "userId, divisionId and screenIds[] are required" });
  }
  const up = await AccessGrant.findOneAndUpdate(
    { user: userId, division: divisionId },
    { $set: { screens: screenIds } },
    { upsert: true, new: true }
  );
  res.json(up);
});

/**
 * PATCH /access/grant/screens
 * Body: { userId, divisionId, op: "set" | "add" | "remove", screenIds: [..] }
 * - set: replace with exactly screenIds
 * - add: $addToSet each in screenIds
 * - remove: $pullAll screenIds
 * Requires: superadmin
 */
r.patch("/grant/screens", requireAuth, requireRole(["superadmin"]), async (req, res) => {
  const { userId, divisionId, op = "set", screenIds = [] } = req.body || {};
  if (!isId(userId) || !isId(divisionId) || !Array.isArray(screenIds)) {
    return res.status(400).json({ message: "userId, divisionId and screenIds[] are required" });
  }
  const base = { user: userId, division: divisionId };

  let update;
  if (op === "add") {
    update = { $addToSet: { screens: { $each: screenIds } } };
  } else if (op === "remove") {
    update = { $pullAll: { screens: screenIds } };
  } else {
    // default "set"
    update = { $set: { screens: screenIds } };
  }

  const doc = await AccessGrant.findOneAndUpdate(base, update, { upsert: op === "set", new: true });
  res.json(doc);
});

/**
 * DELETE /access/grant
 * Query: ?userId=...&divisionId=...
 * Removes the entire grant doc for this {user, division}
 * Requires: superadmin
 */
r.delete("/grant", requireAuth, requireRole(["superadmin"]), async (req, res) => {
  const { userId, divisionId } = req.query || {};
  if (!isId(userId) || !isId(divisionId)) {
    return res.status(400).json({ message: "userId and divisionId are required" });
  }
  const result = await AccessGrant.findOneAndDelete({ user: userId, division: divisionId });
  if (!result) return res.status(404).json({ message: "Grant not found" });
  res.json({ message: "Grant removed", _id: result._id });
});

/**
 * GET /access/grants-by-user?userId=<id>
 * Lists all grants for a given user with populated division/screens.
 * Requires: superadmin
 */
r.get("/grants-by-user", requireAuth, requireRole(["superadmin"]), async (req, res) => {
  const { userId } = req.query || {};
  if (!isId(userId)) return res.status(400).json({ message: "userId is required" });

  const grants = await AccessGrant.find({ user: userId })
    .populate("division", "name code")
    .populate("screens", "key title")
    .lean();

  res.json(grants);
});

/**
 * GET /access/my-access
 * Lists the calling user's own grants
 */
r.get("/my-access", requireAuth, async (req, res) => {
  const grants = await AccessGrant.find({ user: req.user.id })
    .populate("division", "name code")
    .populate("screens", "key title")
    .lean();
  res.json(grants);
});

export default r;
