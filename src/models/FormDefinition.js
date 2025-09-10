import mongoose from "mongoose";
const FormDefinitionSchema = new mongoose.Schema(
  {
    division: { type: mongoose.Types.ObjectId, ref: "Division", required: true, index: true },
    screen:   { type: mongoose.Types.ObjectId, ref: "Screen",   required: true, index: true },
    version:  { type: Number, default: 1 },
    schema:   { type: Object, required: true },   // JSON Schema for validation
    uiSchema: { type: Object, default: {} },      // optional UI hints
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

FormDefinitionSchema.index({ division: 1, screen: 1, isActive: 1 });
export default mongoose.model("FormDefinition", FormDefinitionSchema);
