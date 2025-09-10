// routes/auth.js
import { Router } from "express";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";

const r = Router();
const sign = (p) => jwt.sign(p, process.env.JWT_SECRET);

/* ---------------- Register ---------------- */
r.post("/register", async (req, res) => {
  const { fullName, email, password, role } = req.body || {};
  if (!fullName || !email || !password) {
    return res.status(400).json({ message: "fullName, email, password are required" });
  }
  if (String(password).length !== 8) {
    return res.status(400).json({ message: "Password must be exactly 8 characters" });
  }

  const normEmail = String(email).trim().toLowerCase();
  const exists = await User.findOne({ email: normEmail }).lean();
  if (exists) return res.status(409).json({ message: "Email already in use" });

  const user = await User.create({
    fullName: String(fullName).trim(),
    email: normEmail,
    password,
    role: role || "user",
  });

  const token = sign({ id: user.id });
  res.json({ token, user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role } });
});

/* ---------------- Login ---------------- */
r.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  const normEmail = String(email || "").trim().toLowerCase();

  const user = await User.findOne({ email: normEmail }).select("+password");
  if (!user || !(await user.comparePassword(password))) {
    return res.status(400).json({ message: "Invalid credentials" });
  }
  const token = sign({ id: user.id });
  res.json({ token, user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role } });
});

/* ---------------- Me ---------------- */
r.get("/me", requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id).lean();
  if (!user) return res.status(404).json({ message: "Not found" });
  res.json({ id: user._id, fullName: user.fullName, role: user.role, email: user.email });
});

/* =======================================================================
 *              NEW — Edit personal details (fullName, email)
 * ======================================================================= */
r.patch("/profile", requireAuth, async (req, res) => {
  const { fullName, email } = req.body || {};
  const update = {};

  if (typeof fullName === "string" && fullName.trim()) update.fullName = fullName.trim();

  if (typeof email === "string" && email.trim()) {
    const normEmail = email.trim().toLowerCase();
    // block duplicates
    const exists = await User.findOne({ email: normEmail, _id: { $ne: req.user.id } }).lean();
    if (exists) return res.status(409).json({ message: "Email already in use" });
    update.email = normEmail;
  }

  if (!Object.keys(update).length) {
    return res.status(400).json({ message: "Nothing to update" });
  }

  const user = await User.findByIdAndUpdate(req.user.id, update, { new: true });
  if (!user) return res.status(404).json({ message: "Not found" });

  res.json({ id: user.id, fullName: user.fullName, email: user.email, role: user.role });
});

/* =======================================================================
 *            NEW — Change password (must be exactly 8 chars)
 * ======================================================================= */
r.patch("/password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: "currentPassword and newPassword are required" });
  }
  if (String(newPassword).length !== 8) {
    return res.status(400).json({ message: "New password must be exactly 8 characters" });
  }

  const user = await User.findById(req.user.id).select("+password");
  if (!user) return res.status(404).json({ message: "Not found" });

  const ok = await user.comparePassword(currentPassword);
  if (!ok) return res.status(400).json({ message: "Current password is incorrect" });

  user.password = newPassword;       // triggers pre('save') hash
  await user.save();

  res.json({ ok: true });
});

export default r;
