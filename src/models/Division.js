import mongoose from "mongoose";
const DivisionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    code: { type: String, required: true, unique: true }
  },
  { timestamps: true }
);
export default mongoose.model("Division", DivisionSchema);
