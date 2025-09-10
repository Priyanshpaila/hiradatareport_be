import mongoose from "mongoose";
const ScreenSchema = new mongoose.Schema(
  {
    key:   { type: String, required: true, unique: true }, // e.g., "sales", "production"
    title: { type: String, required: true }
  },
  { timestamps: true }
);
export default mongoose.model("Screen", ScreenSchema);
