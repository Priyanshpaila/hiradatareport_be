import { Router } from "express";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";

const r = Router();

// Register
r.post("/register", async (req, res) => {
  const { fullName, email, password, role } = req.body;
  const user = await User.create({ fullName, email, password, role: role || "user" });
  // IMPORTANT: no expiresIn -> no automatic logout
  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);
  res.json({ token, user: { id: user.id, fullName: user.fullName, role: user.role } });
});

// Login
r.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select("+password");
  if (!user || !(await user.comparePassword(password))) {
    return res.status(400).json({ message: "Invalid credentials" });
  }
  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);
  res.json({ token, user: { id: user.id, fullName: user.fullName, role: user.role } });
});

// Optional: verify token and get current user
r.get("/me", requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id).lean();
  res.json({ id: user._id, fullName: user.fullName, role: user.role, email: user.email });
});

export default r;
