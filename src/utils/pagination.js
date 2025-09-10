export function paginateParams(req, defaultLimit = 20, maxLimit = 100) {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || String(defaultLimit), 10), 1), maxLimit);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}
