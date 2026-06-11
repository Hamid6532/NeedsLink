const router = require('express').Router();
const ctrl   = require('../controllers/donorController');
const { protect, requireRole } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Bookmarks
router.post('/bookmarks',
  protect,
  requireRole('donor'),
  ctrl.addBookmark
);
router.delete('/bookmarks/:orphanageId',
  protect,
  requireRole('donor'),
  ctrl.removeBookmark
);
router.get('/donor/bookmarks',
  protect,
  requireRole('donor'),
  ctrl.getMyBookmarks
);

// Interests
router.post('/interests',
  protect,
  requireRole('donor'),
  ctrl.expressInterest
);

// Donor dashboard activity
router.get('/donor/activity',
  protect,
  requireRole('donor'),
  ctrl.getDonorActivity
);

// Donor profile update
router.put('/donor/profile',
  protect,
  requireRole('donor'),
  upload.single('avatar'),
  ctrl.updateDonorProfile
);

module.exports = router;
