import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireDivisionScreenAccess } from "../middleware/acl.js";
import Submission from "../models/Submission.js";
import mongoose from "mongoose";

const r = Router();

/* ------------------------------- helpers -------------------------------- */

function clampInt(n, min, max, fallback) {
  const x = parseInt(n, 10);
  if (Number.isNaN(x)) return fallback;
  return Math.min(max, Math.max(min, x));
}

function ym(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthsBackList(months) {
  const anchor = new Date();
  anchor.setDate(1); // start of current month
  const out = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(anchor);
    d.setMonth(anchor.getMonth() - i);
    out.push(ym(d));
  }
  return out;
}

/**
 * Builds a pipeline that:
 * - Picks a date expression (createdAt or $data.<dateField>)
 * - Coerces the metric field to number (double)
 * - Groups by month with optional timezone
 * - Aggregates using SUM or AVG
 */
function buildMonthlyPipeline({
  divisionId,
  screenId,
  field = "amount",
  months = 6,
  dateField = null,
  tz = null,
  mode = "sum", // "sum" | "avg"
}) {
  const since = new Date();
  since.setMonth(since.getMonth() - months);

  // Date expression: convert data[dateField] to Date, fallback to createdAt
  const dateExpr = dateField
    ? {
        $ifNull: [
          {
            $convert: {
              input: `$data.${dateField}`,
              to: "date",
              onError: null,
              onNull: null,
            },
          },
          "$createdAt",
        ],
      }
    : "$createdAt";

  // Coerce metric to number (handles strings, nulls, missing keys)
  const yExpr = {
    $convert: { input: `$data.${field}`, to: "double", onError: 0, onNull: 0 },
  };

  const matchStage = {
    $match: {
      division: new mongoose.Types.ObjectId(divisionId),
      screen: new mongoose.Types.ObjectId(screenId),
      // Match by chosen date
      $expr: { $gte: [dateExpr, since] },
    },
  };

  const projectStage = {
    $project: {
      y: yExpr,
      month: {
        $dateToString: {
          format: "%Y-%m",
          date: dateExpr,
          ...(tz ? { timezone: tz } : {}),
        },
      },
    },
  };

  const groupStage =
    mode === "avg"
      ? { $group: { _id: "$month", total: { $avg: "$y" }, count: { $sum: 1 } } }
      : {
          $group: { _id: "$month", total: { $sum: "$y" }, count: { $sum: 1 } },
        };

  return [matchStage, projectStage, groupStage, { $sort: { _id: 1 } }];
}

/* -------------------------------- routes -------------------------------- */

/**
 * GET /analytics/:divisionId/:screenId/sum-by-month
 * Query:
 *   - field:        metric in data (default "amount")
 *   - months:       lookback months (default 6, 1..36)
 *   - dateField:    optional date field in data to group by (else createdAt)
 *   - tz:           optional IANA timezone for grouping (e.g., Asia/Kolkata)
 *   - fill:         "1" to fill missing months with zeros (default "1")
 *
 * Returns: [{ month: "YYYY-MM", total, count }]
 */
r.get(
  "/:divisionId/:screenId/sum-by-month",
  requireAuth,
  requireDivisionScreenAccess,
  async (req, res) => {
    const { divisionId, screenId } = req.params;
    const {
      field = "amount",
      months = 6,
      dateField = null,
      tz = null,
      fill = "1",
    } = req.query;

    const m = clampInt(months, 1, 36, 6);
    const pipeline = buildMonthlyPipeline({
      divisionId,
      screenId,
      field,
      months: m,
      dateField,
      tz,
      mode: "sum",
    });

    const agg = await Submission.aggregate(pipeline);
    // Normalize shape
    const mapped = agg.map((r) => ({
      month: r._id,
      total: r.total,
      count: r.count,
    }));

    if (fill === "1") {
      const baseline = monthsBackList(m);
      const map = new Map(mapped.map((r) => [r.month, r]));
      const filled = baseline.map(
        (mm) => map.get(mm) || { month: mm, total: 0, count: 0 }
      );
      return res.json(filled);
    }

    res.json(mapped);
  }
);

/**
 * GET /analytics/:divisionId/:screenId/avg-by-month
 * Same params as sum-by-month. Aggregates AVG of the metric per month.
 *
 * Returns: [{ month: "YYYY-MM", total, count }]
 *   - "total" here is the average value for that month
 */
r.get(
  "/:divisionId/:screenId/avg-by-month",
  requireAuth,
  requireDivisionScreenAccess,
  async (req, res) => {
    const { divisionId, screenId } = req.params;
    const {
      field = "amount",
      months = 6,
      dateField = null,
      tz = null,
      fill = "1",
    } = req.query;

    const m = clampInt(months, 1, 36, 6);
    const pipeline = buildMonthlyPipeline({
      divisionId,
      screenId,
      field,
      months: m,
      dateField,
      tz,
      mode: "avg",
    });

    const agg = await Submission.aggregate(pipeline);
    const mapped = agg.map((r) => ({
      month: r._id,
      total: r.total, // average for the month
      count: r.count,
    }));

    if (fill === "1") {
      const baseline = monthsBackList(m);
      const map = new Map(mapped.map((r) => [r.month, r]));
      const filled = baseline.map(
        (mm) => map.get(mm) || { month: mm, total: 0, count: 0 }
      );
      return res.json(filled);
    }

    res.json(mapped);
  }
);

// ADD: full rows endpoint (put below your existing routes)
r.get(
  "/:divisionId/:screenId/rows",
  requireAuth,
  requireDivisionScreenAccess,
  async (req, res) => {
    const { divisionId, screenId } = req.params;
    const {
      page = 1,
      limit = 200, // default page size
      sort = "desc", // "asc" | "desc" by date
      dateField = null, // e.g. "txnDate" inside data
      since = null, // ISO date string, inclusive
      until = null, // ISO date string, inclusive
      tz = null, // not needed for raw rows, but kept for parity
    } = req.query;

    const p = clampInt(page, 1, 100000, 1);
    const lim = clampInt(limit, 1, 1000, 200); // hard cap to protect server
    const sortDir = String(sort).toLowerCase() === "asc" ? 1 : -1;

    const sinceDate = since ? new Date(since) : null;
    const untilDate = until ? new Date(until) : null;

    // compute "date to sort/filter by": data[dateField] -> Date, else createdAt
    const dateExpr = dateField
      ? {
          $ifNull: [
            {
              $convert: {
                input: `$data.${dateField}`,
                to: "date",
                onError: null,
                onNull: null,
              },
            },
            "$createdAt",
          ],
        }
      : "$createdAt";

    const pipeline = [
      {
        $match: {
          division: new mongoose.Types.ObjectId(divisionId),
          screen: new mongoose.Types.ObjectId(screenId),
        },
      },
      { $addFields: { _date: dateExpr } },
    ];

    // optional date window on _date
    const dateAnd = [];
    if (sinceDate) dateAnd.push({ $gte: ["$_date", sinceDate] });
    if (untilDate) dateAnd.push({ $lte: ["$_date", untilDate] });
    if (dateAnd.length) pipeline.push({ $match: { $expr: { $and: dateAnd } } });

    // populate submittedBy's name via lookup (works inside aggregate)
    pipeline.push(
      {
        $lookup: {
          from: "users",
          localField: "submittedBy",
          foreignField: "_id",
          as: "u",
        },
      },
      {
        $addFields: {
          submittedByName: {
            $ifNull: [{ $arrayElemAt: ["$u.fullName", 0] }, null],
          },
        },
      },
      { $project: { u: 0 } },

      // keep a stable sort
      { $sort: { _date: sortDir, _id: sortDir } },

      // pagination
      {
        $facet: {
          total: [{ $count: "count" }],
          items: [{ $skip: (p - 1) * lim }, { $limit: lim }],
        },
      }
    );

    const agg = await Submission.aggregate(pipeline);
    const total = agg?.[0]?.total?.[0]?.count || 0;
    const items = agg?.[0]?.items || [];

    // Final shape: each item includes full data + useful meta
    // { _id, data, formVersion, createdAt, updatedAt, submittedBy, submittedByName }
    return res.json({ page: p, limit: lim, total, items });
  }
);

export default r;
