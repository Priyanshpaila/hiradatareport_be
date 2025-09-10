import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const UserSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true },
    email:    { type: String, required: true, unique: true, index: true },
    password: { type: String, required: true, select: false },
    role:     { type: String, enum: ["superadmin", "admin", "user"], default: "user" }
  },
  { timestamps: true }
);

UserSchema.pre("save", async function(next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

UserSchema.methods.comparePassword = function(pw) {
  return bcrypt.compare(pw, this.password);
};

export default mongoose.model("User", UserSchema);
