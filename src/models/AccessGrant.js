import mongoose from "mongoose";
const AccessGrantSchema = new mongoose.Schema(
  {
    user:     { type: mongoose.Types.ObjectId, ref: "User",     required: true, index: true },
    division: { type: mongoose.Types.ObjectId, ref: "Division", required: true, index: true },
    screens:  [{ type: mongoose.Types.ObjectId, ref: "Screen",  required: true }]
  },
  { timestamps: true }
);

AccessGrantSchema.index({ user: 1, division: 1 }, { unique: true });
export default mongoose.model("AccessGrant", AccessGrantSchema);
