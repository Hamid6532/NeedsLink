const router  = require('express').Router();
const ctrl    = require('../controllers/orphanageController');
const { protect, requireRole } = require('../middleware/auth');
const upload  = require('../middleware/upload');

// Public
router.get('/',     ctrl.getAllOrphanages);
router.get('/me',   protect, requireRole('orphanage'), ctrl.getMyOrphanageProfile);
router.get('/:id',  ctrl.getOrphanageById);

// Protected — orphanage owner
router.put('/:id',
  protect,
  requireRole('orphanage'),
  upload.fields([
    { name: 'profile_image', maxCount: 1 },
    { name: 'banner_image',  maxCount: 1 },
  ]),
  ctrl.updateOrphanage
);

module.exports = router;
