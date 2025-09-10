import { Router } from "express";
import Division from "../models/Division.js";
import Screen from "../models/Screen.js";
import FormDefinition from "../models/FormDefinition.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import AccessGrant from "../models/AccessGrant.js";
import Submission from "../models/Submission.js";

import mongoose from "mongoose";

const r = Router();

// Divisions
r.post("/divisions", requireAuth, requireRole(["superadmin"]), async (req, res) => {
  const div = await Division.create(req.body);
  res.json(div);
});
r.get("/divisions", requireAuth, async (_req, res) => {
  res.json(await Division.find().lean());
});

// Screens
r.post("/screens", requireAuth, requireRole(["superadmin"]), async (req, res) => {
  const sc = await Screen.create(req.body);
  res.json(sc);
});
r.get("/screens", requireAuth, async (_req, res) => {
  res.json(await Screen.find().lean());
});

// Form Definitions (versioned by division+screen)
r.post("/form-definitions", requireAuth, requireRole(["superadmin"]), async (req, res) => {
  const { divisionId, screenId, schema, uiSchema } = req.body;
  const latest = await FormDefinition.findOne({
    division: new mongoose.Types.ObjectId(divisionId),
    screen:   new mongoose.Types.ObjectId(screenId),
    isActive: true
  }).sort({ version: -1 });

  const version = latest ? latest.version + 1 : 1;
  if (latest) { latest.isActive = false; await latest.save(); }

  const created = await FormDefinition.create({
    division: divisionId, screen: screenId, schema, uiSchema, version, isActive: true
  });

  res.json(created);
});

r.get("/form-definitions/:divisionId/:screenId", requireAuth, async (req, res) => {
  const { divisionId, screenId } = req.params;
  const fd = await FormDefinition.findOne({
    division: divisionId, screen: screenId, isActive: true
  }).lean();
  res.json(fd || null);
});



// DELETE a Division (and clean related data)
// - removes FormDefinitions for the division
// - removes Submissions for the division
// - removes AccessGrant docs for the division
r.delete(
  "/divisions/:id",
  requireAuth,
  requireRole(["superadmin"]),
  async (req, res) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid division id" });
    }

    const exists = await Division.findById(id).lean();
    if (!exists) return res.status(404).json({ message: "Division not found" });

    // clean children first
    const [defs, subs, grants] = await Promise.all([
      FormDefinition.deleteMany({ division: id }),
      Submission.deleteMany({ division: id }),
      AccessGrant.deleteMany({ division: id }),
    ]);

    const del = await Division.deleteOne({ _id: id });

    res.json({
      message: "Division deleted",
      deleted: del.deletedCount,
      removed: {
        formDefinitions: defs.deletedCount,
        submissions: subs.deletedCount,
        accessGrants: grants.deletedCount,
      },
      _id: id,
    });
  }
);

// DELETE a Screen (and clean related data)
// - removes FormDefinitions for the screen
// - removes Submissions for the screen
// - pulls the screen from any AccessGrant.screens arrays
r.delete(
  "/screens/:id",
  requireAuth,
  requireRole(["superadmin"]),
  async (req, res) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid screen id" });
    }

    const exists = await Screen.findById(id).lean();
    if (!exists) return res.status(404).json({ message: "Screen not found" });

    const [defs, subs, grantsPull] = await Promise.all([
      FormDefinition.deleteMany({ screen: id }),
      Submission.deleteMany({ screen: id }),
      AccessGrant.updateMany({ screens: id }, { $pull: { screens: id } }),
    ]);

    const del = await Screen.deleteOne({ _id: id });

    res.json({
      message: "Screen deleted",
      deleted: del.deletedCount,
      removed: {
        formDefinitions: defs.deletedCount,
        submissions: subs.deletedCount,
        pulledFromGrants: grantsPull.modifiedCount,
      },
      _id: id,
    });
  }
);


export default r;
