import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { connectDB } from "../src/db.js";
import User from "../src/models/User.js";
import Division from "../src/models/Division.js";
import Screen from "../src/models/Screen.js";
import FormDefinition from "../src/models/FormDefinition.js";
import AccessGrant from "../src/models/AccessGrant.js";

async function run() {
  await connectDB(process.env.MONGO_URI);

  // upsert superadmin
  const superEmail = "super@admin.com";
  let superadmin = await User.findOne({ email: superEmail });
  if (!superadmin) {
    superadmin = await User.create({ fullName: "Super Admin", email: superEmail, password: "pass", role: "superadmin" });
  }

  // division + screen
  const division = await Division.findOneAndUpdate(
    { code: "SALES" },
    { name: "Sales Division", code: "SALES" },
    { upsert: true, new: true }
  );
  const screen = await Screen.findOneAndUpdate(
    { key: "sales" },
    { key: "sales", title: "Sales Form" },
    { upsert: true, new: true }
  );

  // form definition (version 1)
  const existingActive = await FormDefinition.findOne({ division: division._id, screen: screen._id, isActive: true });
  if (!existingActive) {
    await FormDefinition.create({
      division: division._id,
      screen: screen._id,
      version: 1,
      schema: {
        title: "Sales Entry",
        type: "object",
        required: ["amount", "date", "region"],
        properties: {
          amount: { type: "number", title: "Amount" },
          date: { type: "string", format: "date", title: "Date" },
          region: { type: "string", enum: ["North", "South", "East", "West"], title: "Region" },
          remarks: { type: "string", title: "Remarks" }
        }
      },
      uiSchema: {}
    });
  }

  // normal user + access
  const alice = await User.findOneAndUpdate(
    { email: "alice@example.com" },
    { fullName: "Alice", email: "alice@example.com", password: "pass", role: "user" },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await AccessGrant.findOneAndUpdate(
    { user: alice._id, division: division._id },
    { $set: { screens: [screen._id] } },
    { upsert: true, new: true }
  );

  console.log("✅ Seed complete");
  await mongoose.disconnect();
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
