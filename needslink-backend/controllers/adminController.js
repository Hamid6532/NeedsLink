const db = require('../config/db');
const { asyncHandler, createError } = require('../middleware/error');

// GET /api/admin/stats
const getStats = asyncHandler(async (req, res) => {
  const [[stats]] = await db.query(
    `SELECT
       (SELECT COUNT(*) FROM users WHERE role = 'donor')     AS total_donors,
       (SELECT COUNT(*) FROM users WHERE role = 'orphanage') AS total_orphanages,
       (SELECT COUNT(*) FROM orphanages WHERE verified = 1)  AS verified_orphanages,
       (SELECT COUNT(*) FROM orphanages WHERE verified = 0)  AS pending_verifications,
       (SELECT COUNT(*) FROM needs)                          AS total_needs,
       (SELECT COUNT(*) FROM needs WHERE status = 'open')    AS open_needs,
       (SELECT COUNT(*) FROM interests)                      AS total_interests,
       (SELECT COUNT(*) FROM bookmarks)                      AS total_bookmarks,
       (SELECT COUNT(*) FROM messages)                       AS total_messages`
  );
  res.json(stats);
});

// GET /api/admin/verifications — pending orphanages
const getPendingVerifications = asyncHandler(async (req, res) => {
  const [pending] = await db.query(
    `SELECT o.*, u.email, u.name AS account_name, u.created_at AS member_since
     FROM orphanages o
     JOIN users u ON u.user_id = o.user_id
     WHERE o.verified = 0 AND u.status = 'active'
     ORDER BY u.created_at ASC`
  );
  res.json({ pending });
});

// POST /api/admin/verify/:orphanageId
const verifyOrphanage = asyncHandler(async (req, res) => {
  const { orphanage_id } = req.params;
  const { decision, notes } = req.body;

  if (!['approved', 'rejected'].includes(decision)) {
    throw createError(400, 'Decision must be "approved" or "rejected".');
  }

  const [orp] = await db.query('SELECT * FROM orphanages WHERE orphanage_id = ?', [orphanage_id]);
  if (!orp.length) throw createError(404, 'Orphanage not found.');

  const verified = decision === 'approved' ? 1 : 0;
  const verified_at = decision === 'approved' ? new Date() : null;

  await db.query(
    'UPDATE orphanages SET verified = ?, verified_at = ? WHERE orphanage_id = ?',
    [verified, verified_at, orphanage_id]
  );

  await db.query(
    'INSERT INTO verifications (orphanage_id, reviewed_by, decision, notes) VALUES (?, ?, ?, ?)',
    [orphanage_id, req.user.user_id, decision, notes || null]
  );

  res.json({ message: `Orphanage ${decision}.` });
});

// GET /api/admin/users
const getAllUsers = asyncHandler(async (req, res) => {
  const { search = '', role = '', page = 1, limit = 30 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = [];
  let where = 'WHERE 1=1';

  if (search) {
    where += ' AND (u.name LIKE ? OR u.email LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  if (role) { where += ' AND u.role = ?'; params.push(role); }

  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM users u ${where}`, params);
  const [users] = await db.query(
    `SELECT u.user_id, u.name, u.email, u.role, u.status, u.email_verified, u.created_at
     FROM users u ${where}
     ORDER BY u.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, parseInt(limit), offset]
  );

  res.json({ users, pagination: { total, page: parseInt(page), limit: parseInt(limit), total_pages: Math.ceil(total / parseInt(limit)) } });
});

// PATCH /api/admin/users/:id/status
const updateUserStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!['active', 'suspended', 'deleted'].includes(status)) {
    throw createError(400, 'Invalid status value.');
  }
  if (parseInt(req.params.id) === req.user.user_id) {
    throw createError(400, 'You cannot change your own status.');
  }
  await db.query('UPDATE users SET status = ? WHERE user_id = ?', [status, req.params.id]);
  res.json({ message: `User status updated to ${status}.` });
});

module.exports = { getStats, getPendingVerifications, verifyOrphanage, getAllUsers, updateUserStatus };
