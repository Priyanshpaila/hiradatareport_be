import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const requireAuth = async (req, res, next) => {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  if (!token) return res.status(401).json({ message: "No token" });
  try {
    // NOTE: No exp claim is set when issuing tokens, so they never expire automatically.
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.id);
    if (!user) return res.status(401).json({ message: "Invalid user" });
    req.user = { id: user.id, role: user.role, fullName: user.fullName };
    next();
  } catch (e) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

export const requireRole = roles => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role))
    return res.status(403).json({ message: "Forbidden" });
  next();
};
