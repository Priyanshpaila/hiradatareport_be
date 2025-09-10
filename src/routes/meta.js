import { Router } from "express";
import Division from "../models/Division.js";
import Screen from "../models/Screen.js";
import FormDefinition from "../models/FormDefinition.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
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

export default r;
