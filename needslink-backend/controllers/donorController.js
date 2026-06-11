const db = require('../config/db');
const { asyncHandler, createError } = require('../middleware/error');
const { sendMail, emailTemplates }  = require('../utils/email');

// POST /api/bookmarks
const addBookmark = asyncHandler(async (req, res) => {
  const { orphanage_id } = req.body;
  if (!orphanage_id) throw createError(400, 'orphanage_id is required.');

  const [orp] = await db.query('SELECT orphanage_id FROM orphanages WHERE orphanage_id = ?', [orphanage_id]);
  if (!orp.length) throw createError(404, 'Orphanage not found.');

  await db.query(
    'INSERT IGNORE INTO bookmarks (donor_id, orphanage_id) VALUES (?, ?)',
    [req.user.user_id, orphanage_id]
  );
  res.status(201).json({ message: 'Bookmarked.' });
});

// DELETE /api/bookmarks/:orphanageId
const removeBookmark = asyncHandler(async (req, res) => {
  await db.query(
    'DELETE FROM bookmarks WHERE donor_id = ? AND orphanage_id = ?',
    [req.user.user_id, req.params.orphanageId]
  );
  res.json({ message: 'Bookmark removed.' });
});

// GET /api/donor/bookmarks
const getMyBookmarks = asyncHandler(async (req, res) => {
  const [bookmarks] = await db.query(
    `SELECT o.*, u.email,
       (SELECT COUNT(*) FROM needs n WHERE n.orphanage_id = o.orphanage_id AND n.status='open') AS open_needs_count,
       (SELECT COUNT(*) FROM bookmarks bb WHERE bb.orphanage_id = o.orphanage_id) AS bookmark_count
     FROM bookmarks b
     JOIN orphanages o ON o.orphanage_id = b.orphanage_id
     JOIN users u ON u.user_id = o.user_id
     WHERE b.donor_id = ?
     ORDER BY b.created_at DESC`,
    [req.user.user_id]
  );
  res.json({ bookmarks });
});

// POST /api/interests
const expressInterest = asyncHandler(async (req, res) => {
  const { need_id, note } = req.body;
  if (!need_id) throw createError(400, 'need_id is required.');

  const [need] = await db.query(
    `SELECT n.*, o.org_name, o.orphanage_id, u.email AS orphanage_email, u.name AS orphanage_name
     FROM needs n
     JOIN orphanages o ON o.orphanage_id = n.orphanage_id
     JOIN users u ON u.user_id = o.user_id
     WHERE n.need_id = ?`,
    [need_id]
  );
  if (!need.length) throw createError(404, 'Need not found.');
  if (need[0].status !== 'open') throw createError(400, 'This need is no longer open.');

  await db.query(
    'INSERT INTO interests (donor_id, need_id, note) VALUES (?, ?, ?)',
    [req.user.user_id, need_id, note || null]
  );

  // Notify orphanage
  const n = need[0];
  const tmpl = emailTemplates.donorInterest(n.orphanage_name, req.user.name, n.title, note);
  await sendMail({ to: n.orphanage_email, ...tmpl });

  res.status(201).json({ message: 'Interest registered. The orphanage has been notified.' });
});

// GET /api/donor/activity — dashboard feed + recent interests
const getDonorActivity = asyncHandler(async (req, res) => {
  const user_id = req.user.user_id;

  // Stats
  const [[stats]] = await db.query(
    `SELECT
       (SELECT COUNT(*) FROM bookmarks WHERE donor_id = ?)              AS total_bookmarks,
       (SELECT COUNT(*) FROM interests WHERE donor_id = ?)              AS total_interests,
       (SELECT COUNT(*) FROM messages WHERE sender_id = ?)              AS total_messages,
       (SELECT COUNT(DISTINCT orphanage_id)
        FROM (SELECT orphanage_id FROM bookmarks WHERE donor_id = ?
              UNION
              SELECT n.orphanage_id FROM interests i
              JOIN needs n ON n.need_id = i.need_id
              WHERE i.donor_id = ?) t
       ) AS orphanages_browsed`,
    [user_id, user_id, user_id, user_id, user_id]
  );

  // Feed: recent needs from bookmarked orphanages
  const [feed] = await db.query(
    `SELECT n.*, o.org_name, o.orphanage_id
     FROM needs n
     JOIN orphanages o ON o.orphanage_id = n.orphanage_id
     JOIN bookmarks b ON b.orphanage_id = o.orphanage_id
     WHERE b.donor_id = ? AND n.status = 'open'
     ORDER BY n.created_at DESC
     LIMIT 10`,
    [user_id]
  );

  // Recent interests
  const [recent_interests] = await db.query(
    `SELECT i.*, n.title, n.category, n.urgency, n.status, n.orphanage_id, o.org_name
     FROM interests i
     JOIN needs n ON n.need_id = i.need_id
     JOIN orphanages o ON o.orphanage_id = n.orphanage_id
     WHERE i.donor_id = ?
     ORDER BY i.created_at DESC
     LIMIT 20`,
    [user_id]
  );

  res.json({ stats, feed, recent_interests });
});

// PUT /api/donor/profile
const updateDonorProfile = asyncHandler(async (req, res) => {
  const { bio, phone, location } = req.body;
  const avatar_url = req.file ? `/uploads/${req.file.filename}` : undefined;

  const fields = []; const vals = [];
  if (bio !== undefined)  { fields.push('bio = ?');      vals.push(bio); }
  if (phone)              { fields.push('phone = ?');     vals.push(phone); }
  if (location)           { fields.push('location = ?');  vals.push(location); }
  if (avatar_url)         { fields.push('avatar_url = ?'); vals.push(avatar_url); }

  if (fields.length) {
    vals.push(req.user.user_id);
    await db.query(`UPDATE donor_profiles SET ${fields.join(', ')} WHERE user_id = ?`, vals);
  }

  // Also update name on users table
  if (req.body.name) {
    await db.query('UPDATE users SET name = ? WHERE user_id = ?', [req.body.name, req.user.user_id]);
  }

  res.json({ message: 'Profile updated.' });
});

module.exports = { addBookmark, removeBookmark, getMyBookmarks, expressInterest, getDonorActivity, updateDonorProfile };
