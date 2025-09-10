import dotenv from "dotenv";
dotenv.config();

import app from "./app.js";
import { connectDB } from "./db.js";

const { PORT = 5000, MONGO_URI } = process.env;

await connectDB(MONGO_URI);
app.listen(PORT, () => console.log(`🚀 API on ${PORT}`));
