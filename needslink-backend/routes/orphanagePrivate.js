const router   = require('express').Router();
const { protect, requireRole } = require('../middleware/auth');
const { getMyOrphanageProfile, updateOrphanage } = require('../controllers/orphanageController');
const { getMyNeeds } = require('../controllers/needsController');
const upload   = require('../middleware/upload');

const isOrphanage = [protect, requireRole('orphanage')];

// GET  /api/orphanage/me    — dashboard stats + profile
router.get('/me',    ...isOrphanage, getMyOrphanageProfile);

// GET  /api/orphanage/needs — own needs list
router.get('/needs', ...isOrphanage, getMyNeeds);

// PUT  /api/orphanage/profile — update own profile + images
router.put('/profile', ...isOrphanage,
  upload.fields([
    { name: 'profile_image', maxCount: 1 },
    { name: 'banner_image',  maxCount: 1 },
  ]),
  async (req, res, next) => {
    // Inject orphanage_id from user_id then delegate to updateOrphanage
    const db = require('../config/db');
    const [rows] = await db.query('SELECT orphanage_id FROM orphanages WHERE user_id = ?', [req.user.user_id]);
    if (!rows.length) return res.status(404).json({ message: 'Orphanage not found.' });
    req.params.id = rows[0].orphanage_id;
    next();
  },
  updateOrphanage
);

module.exports = router;
