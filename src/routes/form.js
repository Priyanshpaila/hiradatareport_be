// src/routes/form.js
import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireDivisionScreenAccess } from "../middleware/acl.js";
import FormDefinition from "../models/FormDefinition.js";
import Submission from "../models/Submission.js";

// ✅ Ajv for different drafts
import Ajv2020 from "ajv/dist/2020.js";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const ajv2020 = new Ajv2020({ allErrors: true, removeAdditional: false, strict: false });
const ajv07 = new Ajv({ allErrors: true, removeAdditional: false, strict: false });
addFormats(ajv2020);
addFormats(ajv07);

const validatorCache = new Map(); // key: `${divisionId}:${screenId}:v${version}`

function pickAjv(schema) {
  const id = typeof schema?.$schema === "string" ? schema.$schema : "";
  if (id.includes("2020-12")) return ajv2020;
  return ajv07;
}
function sanitizeSchemaForAjv(schema) {
  const id = typeof schema?.$schema === "string" ? schema.$schema : "";
  if (!id) return schema;
  const supported = /(draft-07|2019-09|2020-12)/.test(id);
  if (supported) return schema;
  const clone = { ...schema };
  delete clone.$schema;
  return clone;
}

const r = Router();

/* ------------------ Active schema ------------------ */
r.get("/:divisionId/:screenId/schema", requireAuth, requireDivisionScreenAccess, async (req, res) => {
  const { divisionId, screenId } = req.params;
  const fd = await FormDefinition.findOne({
    division: divisionId,
    screen: screenId,
    isActive: true,
  }).lean();
  res.json(fd || null);
});

/* ------------------ Submit form ------------------ */
r.post("/:divisionId/:screenId/submit", requireAuth, requireDivisionScreenAccess, async (req, res) => {
  const { divisionId, screenId } = req.params;
  const fd = await FormDefinition.findOne({ division: divisionId, screen: screenId, isActive: true }).lean();
  if (!fd) return res.status(400).json({ message: "Form not available" });

  // compile validator (cached by version)
  const key = `${divisionId}:${screenId}:v${fd.version}`;
  let validate = validatorCache.get(key);
  try {
    if (!validate) {
      const schema = sanitizeSchemaForAjv(fd.schema || {});
      const ajv = pickAjv(schema);
      validate = ajv.compile(schema);
      validatorCache.set(key, validate);
    }
  } catch (e) {
    return res.status(400).json({ message: "Schema compile error", error: String(e.message) });
  }

  const ok = validate(req.body);
  if (!ok) {
    return res.status(422).json({ message: "Validation error", errors: validate.errors });
  }

  // Save submission with the current user
  const sub = await Submission.create({
    division: divisionId,
    screen: screenId,
    formVersion: fd.version,
    submittedBy: req.user.id, // <- ref to User
    data: req.body,
  });

  // Populate and send back submitter name too
  const populated = await sub.populate({ path: "submittedBy", select: "fullName email" });
  const obj = populated.toObject();
  obj.submittedByName = populated.submittedBy?.fullName || populated.submittedBy?.email || null;

  res.json(obj);
});

/* ------------------ List submissions ------------------ */
r.get("/:divisionId/:screenId/submissions", requireAuth, requireDivisionScreenAccess, async (req, res) => {
  const { divisionId, screenId } = req.params;

  const items = await Submission.find({ division: divisionId, screen: screenId })
    .sort({ createdAt: -1 })
    .limit(100)
    .populate({ path: "submittedBy", select: "fullName email" }) // <- get the user
    .lean();

  // Add a flat name field to make UI simple even without checking populate shape
  const withNames = items.map((it) => ({
    ...it,
    submittedByName: it.submittedBy?.fullName || it.submittedBy?.email || null,
  }));

  res.json(withNames);
});

export default r;
