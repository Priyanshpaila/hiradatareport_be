import { Router } from "express";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { requireAuth, requireRole } from "../middleware/auth.js";
import User from "../models/User.js";

const r = Router();

/* ----------------------------- helpers ---------------------------------- */

const isObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

async function assertNotLastSuperadmin(targetUserId, actionLabel) {
  const target = await User.findById(targetUserId).lean();
  if (!target) return; // not found case handled elsewhere
  if (target.role !== "superadmin") return;

  const superadminCount = await User.countDocuments({ role: "superadmin" });
  if (superadminCount <= 1) {
    const msg = `Blocked: cannot ${actionLabel} the last remaining superadmin`;
    const err = new Error(msg);
    err.status = 400;
    throw err;
  }
}

/* ----------------------------- GET /users -------------------------------- */

/**
 * GET /admin/users?q=<search>&limit=50&page=1
 * Returns paginated list of users: [{ _id, fullName, email, role }]
 * Requires: superadmin
 */
r.get("/users", requireAuth, requireRole(["superadmin"]), async (req, res) => {
  const q = String(req.query.q || "").trim();
  let limit = parseInt(req.query.limit, 10);
  let page = parseInt(req.query.page, 10);

  if (Number.isNaN(limit) || limit <= 0) limit = 50;
  if (Number.isNaN(page) || page <= 0) page = 1;

  limit = Math.min(limit, 100);
  const skip = (page - 1) * limit;

  const match = {};
  if (q) {
    match.$or = [
      { fullName: { $regex: q, $options: "i" } },
      { email: { $regex: q, $options: "i" } },
    ];
  }

  const [items, total] = await Promise.all([
    User.find(match, { fullName: 1, email: 1, role: 1 })
      .sort({ fullName: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(match),
  ]);

  res.json({
    items,
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
  });
});

/* ---------------------------- GET /users/:id ----------------------------- */

/**
 * GET /admin/users/:id
 * Returns one user (without password)
 * Requires: superadmin
 */
r.get("/users/:id", requireAuth, requireRole(["superadmin"]), async (req, res) => {
  const { id } = req.params;
  if (!isObjectId(id)) return res.status(400).json({ message: "Invalid id" });

  const user = await User.findById(id, { fullName: 1, email: 1, role: 1 }).lean();
  if (!user) return res.status(404).json({ message: "User not found" });

  res.json(user);
});

/* ------------------------------ POST /users ------------------------------ */

/**
 * POST /admin/users
 * Body: { fullName, email, password, role? }
 * Creates a new user (role defaults to "user")
 * Requires: superadmin
 */
r.post("/users", requireAuth, requireRole(["superadmin"]), async (req, res) => {
  const { fullName, email, password, role } = req.body || {};
  if (!fullName || !email || !password) {
    return res.status(400).json({ message: "fullName, email, password are required" });
  }

  const exists = await User.findOne({ email }).lean();
  if (exists) return res.status(400).json({ message: "Email already in use" });

  const user = await User.create({
    fullName,
    email,
    password, // hashed by pre-save hook
    role: role || "user",
  });

  res.status(201).json({ _id: user._id, fullName: user.fullName, email: user.email, role: user.role });
});

/* ----------------------------- PATCH /users/:id -------------------------- */

/**
 * PATCH /admin/users/:id
 * Body: { fullName?, email? }
 * Update basic profile fields
 * Requires: superadmin
 */
r.patch("/users/:id", requireAuth, requireRole(["superadmin"]), async (req, res) => {
  const { id } = req.params;
  if (!isObjectId(id)) return res.status(400).json({ message: "Invalid id" });

  const { fullName, email } = req.body || {};
  const update = {};
  if (typeof fullName === "string" && fullName.trim()) update.fullName = fullName.trim();
  if (typeof email === "string" && email.trim()) {
    // ensure unique email
    const exists = await User.findOne({ email: email.trim(), _id: { $ne: id } }).lean();
    if (exists) return res.status(400).json({ message: "Email already in use" });
    update.email = email.trim();
  }

  const user = await User.findByIdAndUpdate(id, { $set: update }, { new: true, projection: { fullName: 1, email: 1, role: 1 } });
  if (!user) return res.status(404).json({ message: "User not found" });

  res.json(user);
});

/* ------------------------ PATCH /users/:id/role -------------------------- */

/**
 * PATCH /admin/users/:id/role
 * Body: { role } where role in ["superadmin","admin","user"]
 * Changes a user's role
 * Requires: superadmin
 * Safety: cannot demote the last superadmin
 */
r.patch("/users/:id/role", requireAuth, requireRole(["superadmin"]), async (req, res) => {
  const { id } = req.params;
  if (!isObjectId(id)) return res.status(400).json({ message: "Invalid id" });

  const { role } = req.body || {};
  const allowed = ["superadmin", "admin", "user"];
  if (!allowed.includes(role)) return res.status(400).json({ message: "Invalid role" });

  if (role !== "superadmin") {
    // if target is currently superadmin, ensure not last one
    await assertNotLastSuperadmin(id, "change role of");
  }

  const user = await User.findByIdAndUpdate(id, { $set: { role } }, { new: true, projection: { fullName: 1, email: 1, role: 1 } });
  if (!user) return res.status(404).json({ message: "User not found" });

  res.json(user);
});

/* --------------------- PATCH /users/:id/password ------------------------- */

/**
 * PATCH /admin/users/:id/password
 * Body: { password }
 * Resets a user's password (exactly 8 chars if you want to mirror frontend)
 * Requires: superadmin
 */
r.patch("/users/:id/password", requireAuth, requireRole(["superadmin"]), async (req, res) => {
  const { id } = req.params;
  if (!isObjectId(id)) return res.status(400).json({ message: "Invalid id" });

  const { password } = req.body || {};
  if (typeof password !== "string" || password.length < 1) {
    return res.status(400).json({ message: "Password is required" });
  }
  // If you want to enforce exactly 8 characters on backend too:
  // if (password.length !== 8) return res.status(400).json({ message: "Password must be exactly 8 characters" });

  // bypass pre-save by hashing here (since using findByIdAndUpdate)
  const hash = await bcrypt.hash(password, 10);
  const user = await User.findByIdAndUpdate(id, { $set: { password: hash } }, { new: true, projection: { fullName: 1, email: 1, role: 1 } });
  if (!user) return res.status(404).json({ message: "User not found" });

  res.json({ message: "Password updated" });
});

/* --------------------------- DELETE /users/:id --------------------------- */

/**
 * DELETE /admin/users/:id
 * Deletes a user
 * Requires: superadmin
 * Safety: cannot delete the last superadmin
 */
r.delete("/users/:id", requireAuth, requireRole(["superadmin"]), async (req, res) => {
  const { id } = req.params;
  if (!isObjectId(id)) return res.status(400).json({ message: "Invalid id" });

  await assertNotLastSuperadmin(id, "delete");

  const deleted = await User.findByIdAndDelete(id);
  if (!deleted) return res.status(404).json({ message: "User not found" });

  res.json({ message: "User deleted", _id: deleted._id });
});

export default r;
