import mongoose from "mongoose";
const SubmissionSchema = new mongoose.Schema(
  {
    division:     { type: mongoose.Types.ObjectId, ref: "Division", required: true, index: true },
    screen:       { type: mongoose.Types.ObjectId, ref: "Screen",   required: true, index: true },
    formVersion:  { type: Number, required: true },
    submittedBy:  { type: mongoose.Types.ObjectId, ref: "User",     required: true, index: true },
    data:         { type: Object, required: true }
  },
  { timestamps: true }
);

SubmissionSchema.index({ division: 1, screen: 1, createdAt: -1 });
export default mongoose.model("Submission", SubmissionSchema);
