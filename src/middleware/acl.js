import AccessGrant from "../models/AccessGrant.js";
import mongoose from "mongoose";

export const requireDivisionScreenAccess = async (req, res, next) => {
  const { divisionId, screenId } = req.params;
  try {
    const grant = await AccessGrant.findOne({
      user: req.user.id,
      division: new mongoose.Types.ObjectId(divisionId)
    }).lean();

    if (!grant) return res.status(403).json({ message: "No access to division" });
    const allowed = grant.screens.some(s => String(s) === String(screenId));
    if (!allowed) return res.status(403).json({ message: "No access to screen" });
    next();
  } catch (e) {
    return res.status(500).json({ message: "ACL check failed" });
  }
};
