const db = require('../config/db');
const { asyncHandler, createError } = require('../middleware/error');
const { sendMail, emailTemplates }  = require('../utils/email');

// POST /api/needs — orphanage only
const createNeed = asyncHandler(async (req, res) => {
  const { title, category, description, quantity, quantity_unit, urgency } = req.body;
  if (!title || !description) throw createError(400, 'Title and description are required.');

  const [orp] = await db.query('SELECT orphanage_id FROM orphanages WHERE user_id = ?', [req.user.user_id]);
  if (!orp.length) throw createError(404, 'Orphanage profile not found.');
  const orphanage_id = orp[0].orphanage_id;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO needs (orphanage_id, title, category, description, quantity, quantity_unit, urgency)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [orphanage_id, title, category || 'other', description,
       quantity || null, quantity_unit || null, urgency || 'medium']
    );
    const need_id = result.insertId;

    // Save uploaded images
    if (req.files?.length) {
      const imgVals = req.files.map(f => [need_id, `/uploads/${f.filename}`]);
      await conn.query('INSERT INTO need_images (need_id, image_url) VALUES ?', [imgVals]);
    }

    await conn.commit();

    // Notify bookmarking donors
    const [bookmarkers] = await db.query(
      `SELECT u.email, u.name FROM bookmarks b
       JOIN users u ON u.user_id = b.donor_id
       WHERE b.orphanage_id = ?`,
      [orphanage_id]
    );
    const [orgRows] = await db.query('SELECT org_name FROM orphanages WHERE orphanage_id = ?', [orphanage_id]);
    const orgName = orgRows[0]?.org_name || 'An orphanage';

    for (const donor of bookmarkers) {
      const tmpl = emailTemplates.newNeedNotification(donor.name, orgName, title);
      await sendMail({ to: donor.email, ...tmpl });
    }

    res.status(201).json({ message: 'Need posted successfully.', need_id });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

// GET /api/needs — public, filterable
const getAllNeeds = asyncHandler(async (req, res) => {
  const { orphanage_id, category, urgency, status = 'open', page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = [];
  let where = 'WHERE 1=1';

  if (orphanage_id) { where += ' AND n.orphanage_id = ?'; params.push(orphanage_id); }
  if (category)     { where += ' AND n.category = ?';     params.push(category); }
  if (urgency)      { where += ' AND n.urgency = ?';      params.push(urgency); }
  if (status)       { where += ' AND n.status = ?';       params.push(status); }

  const [needs] = await db.query(
    `SELECT n.*, o.org_name, GROUP_CONCAT(ni.image_url) AS images
     FROM needs n
     JOIN orphanages o ON o.orphanage_id = n.orphanage_id
     LEFT JOIN need_images ni ON ni.need_id = n.need_id
     ${where}
     GROUP BY n.need_id
     ORDER BY FIELD(n.urgency,'critical','high','medium','low'), n.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, parseInt(limit), offset]
  );
  needs.forEach(n => { n.images = n.images ? n.images.split(',') : []; });
  res.json({ needs });
});

// GET /api/needs/:id
const getNeedById = asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    `SELECT n.*, o.org_name, o.orphanage_id,
            GROUP_CONCAT(ni.image_url) AS images
     FROM needs n
     JOIN orphanages o ON o.orphanage_id = n.orphanage_id
     LEFT JOIN need_images ni ON ni.need_id = n.need_id
     WHERE n.need_id = ?
     GROUP BY n.need_id`,
    [req.params.id]
  );
  if (!rows.length) throw createError(404, 'Need not found.');
  const need = rows[0];
  need.images = need.images ? need.images.split(',') : [];
  res.json({ need });
});

// PUT /api/needs/:id — orphanage owner only
const updateNeed = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const [orp] = await db.query('SELECT orphanage_id FROM orphanages WHERE user_id = ?', [req.user.user_id]);
  if (!orp.length) throw createError(404, 'Orphanage not found.');

  const [need] = await db.query('SELECT * FROM needs WHERE need_id = ?', [id]);
  if (!need.length) throw createError(404, 'Need not found.');
  if (need[0].orphanage_id !== orp[0].orphanage_id) throw createError(403, 'Not your need.');

  const { title, category, description, quantity, quantity_unit, urgency, status } = req.body;
  const fields = []; const vals = [];

  if (title)        { fields.push('title = ?');         vals.push(title); }
  if (category)     { fields.push('category = ?');      vals.push(category); }
  if (description)  { fields.push('description = ?');   vals.push(description); }
  if (quantity !== undefined)      { fields.push('quantity = ?');      vals.push(quantity); }
  if (quantity_unit !== undefined) { fields.push('quantity_unit = ?'); vals.push(quantity_unit); }
  if (urgency)      { fields.push('urgency = ?');       vals.push(urgency); }
  if (status)       { fields.push('status = ?');        vals.push(status); }

  if (!fields.length) throw createError(400, 'No fields to update.');
  vals.push(id);
  await db.query(`UPDATE needs SET ${fields.join(', ')} WHERE need_id = ?`, vals);

  const [updated] = await db.query('SELECT * FROM needs WHERE need_id = ?', [id]);
  res.json({ message: 'Need updated.', need: updated[0] });
});

// DELETE /api/needs/:id
const deleteNeed = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const [orp] = await db.query('SELECT orphanage_id FROM orphanages WHERE user_id = ?', [req.user.user_id]);
  if (!orp.length) throw createError(404, 'Orphanage not found.');

  const [need] = await db.query('SELECT orphanage_id FROM needs WHERE need_id = ?', [id]);
  if (!need.length) throw createError(404, 'Need not found.');
  if (need[0].orphanage_id !== orp[0].orphanage_id) throw createError(403, 'Not your need.');

  await db.query('DELETE FROM needs WHERE need_id = ?', [id]);
  res.json({ message: 'Need deleted.' });
});

// GET /api/orphanage/needs — my orphanage's needs
const getMyNeeds = asyncHandler(async (req, res) => {
  const [orp] = await db.query('SELECT orphanage_id FROM orphanages WHERE user_id = ?', [req.user.user_id]);
  if (!orp.length) throw createError(404, 'Orphanage not found.');

  const [needs] = await db.query(
    `SELECT n.*, GROUP_CONCAT(ni.image_url) AS images
     FROM needs n
     LEFT JOIN need_images ni ON ni.need_id = n.need_id
     WHERE n.orphanage_id = ?
     GROUP BY n.need_id
     ORDER BY n.created_at DESC`,
    [orp[0].orphanage_id]
  );
  needs.forEach(n => { n.images = n.images ? n.images.split(',') : []; });
  res.json({ needs });
});

module.exports = { createNeed, getAllNeeds, getNeedById, updateNeed, deleteNeed, getMyNeeds };
