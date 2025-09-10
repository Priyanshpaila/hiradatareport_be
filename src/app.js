import express from "express";
import cors from "cors";
import morgan from "morgan";

import authRoutes from "./routes/auth.js";
import adminRoutes from "./routes/admin.js";
import metaRoutes from "./routes/meta.js";
import accessRoutes from "./routes/access.js";
import formRoutes from "./routes/form.js";
import analyticsRoutes from "./routes/analytics.js";
import { notFound, errorHandler } from "./middleware/error.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

app.get("/", (_req, res) => res.json({ ok: true, name: "division-forms-backend" }));

app.use("/auth", authRoutes);
app.use("/meta", metaRoutes);
app.use("/access", accessRoutes);
app.use("/forms", formRoutes);
app.use("/analytics", analyticsRoutes);
app.use("/admin", adminRoutes);

// 404 + centralized error handler
app.use(notFound);
app.use(errorHandler);

export default app;
