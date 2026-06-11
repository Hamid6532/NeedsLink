const db = require('../config/db');
const { asyncHandler, createError } = require('../middleware/error');

// GET /api/orphanages  — public, searchable, filterable
const getAllOrphanages = asyncHandler(async (req, res) => {
  const { search, location, category, verified, page = 1, limit = 12 } = req.query;

  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = [];
  let where = 'WHERE u.status = "active"';

  if (verified !== undefined) {
    where += ' AND o.verified = ?';
    params.push(verified === 'true' ? 1 : 0);
  } else {
    where += ' AND o.verified = 1'; // default: only show verified
  }

  if (search) {
    where += ' AND (o.org_name LIKE ? OR o.location LIKE ? OR o.description LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s);
  }

  if (location) {
    where += ' AND o.location LIKE ?';
    params.push(`%${location}%`);
  }

  if (category) {
    where += ` AND o.orphanage_id IN (
      SELECT DISTINCT orphanage_id FROM needs WHERE category = ? AND status != 'closed'
    )`;
    params.push(category);
  }

  const countSql = `
    SELECT COUNT(*) AS total
    FROM orphanages o
    JOIN users u ON u.user_id = o.user_id
    ${where}`;

  const dataSql = `
    SELECT
      o.orphanage_id, o.org_name, o.location, o.description,
      o.contact_person, o.phone, o.profile_image_url, o.banner_image_url,
      o.verified, o.verified_at, u.email,
      (SELECT COUNT(*) FROM needs n WHERE n.orphanage_id = o.orphanage_id AND n.status = 'open') AS open_needs_count,
      (SELECT COUNT(*) FROM bookmarks b WHERE b.orphanage_id = o.orphanage_id) AS bookmark_count
    FROM orphanages o
    JOIN users u ON u.user_id = o.user_id
    ${where}
    ORDER BY o.verified DESC, o.org_name ASC
    LIMIT ? OFFSET ?`;

  const [[{ total }]] = await db.query(countSql, params);
  const [orphanages]  = await db.query(dataSql, [...params, parseInt(limit), offset]);

  res.json({
    orphanages,
    pagination: {
      total,
      page:        parseInt(page),
      limit:       parseInt(limit),
      total_pages: Math.ceil(total / parseInt(limit)),
    },
  });
});

// GET /api/orphanages/:id — public
const getOrphanageById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const [rows] = await db.query(
    `SELECT o.*, u.email, u.name AS account_name, u.created_at AS member_since
     FROM orphanages o
     JOIN users u ON u.user_id = o.user_id
     WHERE o.orphanage_id = ? AND u.status = 'active'`,
    [id]
  );
  if (!rows.length) throw createError(404, 'Orphanage not found.');

  const orphanage = rows[0];

  // Fetch open needs
  const [needs] = await db.query(
    `SELECT n.*, GROUP_CONCAT(ni.image_url) AS images
     FROM needs n
     LEFT JOIN need_images ni ON ni.need_id = n.need_id
     WHERE n.orphanage_id = ? AND n.status != 'closed'
     GROUP BY n.need_id
     ORDER BY FIELD(n.urgency,'critical','high','medium','low'), n.created_at DESC`,
    [id]
  );

  // Parse images string into array
  needs.forEach(n => { n.images = n.images ? n.images.split(',') : []; });

  // Fetch recent donation updates
  const [updates] = await db.query(
    `SELECT * FROM donation_updates WHERE orphanage_id = ? ORDER BY created_at DESC LIMIT 10`,
    [id]
  );

  res.json({ orphanage, needs, updates });
});

// PUT /api/orphanages/:id — orphanage owner only
const updateOrphanage = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Confirm ownership
  const [rows] = await db.query(
    'SELECT orphanage_id, user_id FROM orphanages WHERE orphanage_id = ?',
    [id]
  );
  if (!rows.length) throw createError(404, 'Orphanage not found.');
  if (rows[0].user_id !== req.user.user_id) throw createError(403, 'You can only edit your own profile.');

  const { org_name, location, description, contact_person, phone, website } = req.body;

  const profile_image_url = req.files?.profile_image
    ? `/uploads/${req.files.profile_image[0].filename}`
    : undefined;
  const banner_image_url = req.files?.banner_image
    ? `/uploads/${req.files.banner_image[0].filename}`
    : undefined;

  const fields = [];
  const vals   = [];

  if (org_name)       { fields.push('org_name = ?');       vals.push(org_name); }
  if (location)       { fields.push('location = ?');       vals.push(location); }
  if (description !== undefined) { fields.push('description = ?'); vals.push(description); }
  if (contact_person) { fields.push('contact_person = ?'); vals.push(contact_person); }
  if (phone)          { fields.push('phone = ?');          vals.push(phone); }
  if (website)        { fields.push('website = ?');        vals.push(website); }
  if (profile_image_url) { fields.push('profile_image_url = ?'); vals.push(profile_image_url); }
  if (banner_image_url)  { fields.push('banner_image_url = ?');  vals.push(banner_image_url); }

  if (!fields.length) throw createError(400, 'No fields to update.');

  vals.push(id);
  await db.query(`UPDATE orphanages SET ${fields.join(', ')} WHERE orphanage_id = ?`, vals);

  const [updated] = await db.query('SELECT * FROM orphanages WHERE orphanage_id = ?', [id]);
  res.json({ message: 'Profile updated successfully.', orphanage: updated[0] });
});

// GET /api/orphanages/me — orphanage dashboard: own profile + stats
const getMyOrphanageProfile = asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    'SELECT * FROM orphanages WHERE user_id = ?',
    [req.user.user_id]
  );
  if (!rows.length) throw createError(404, 'Orphanage profile not found.');
  const orphanage = rows[0];

  const [[stats]] = await db.query(
    `SELECT
       COUNT(*)                                                    AS total_needs,
       SUM(status = 'open')                                        AS open_needs,
       SUM(status = 'fulfilled')                                   AS fulfilled_needs,
       (SELECT COUNT(*) FROM interests i
        JOIN needs n ON n.need_id = i.need_id
        WHERE n.orphanage_id = ?)                                  AS total_interests,
       (SELECT COUNT(*) FROM bookmarks WHERE orphanage_id = ?)     AS total_bookmarks,
       (SELECT COUNT(*) FROM donation_updates WHERE orphanage_id = ?) AS total_updates
     FROM needs WHERE orphanage_id = ?`,
    [orphanage.orphanage_id, orphanage.orphanage_id, orphanage.orphanage_id, orphanage.orphanage_id]
  );

  res.json({ orphanage, stats });
});

module.exports = { getAllOrphanages, getOrphanageById, updateOrphanage, getMyOrphanageProfile };
