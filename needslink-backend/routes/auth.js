const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('../controllers/authController');
const { protect } = require('../middleware/auth');

router.post('/register', [
  body('name').notEmpty().withMessage('Name is required.'),
  body('email').isEmail().withMessage('Valid email required.'),
  body('password').isLength({ min: 8 }).withMessage('Min 8 characters.'),
  body('role').isIn(['donor', 'orphanage']).withMessage('Role must be donor or orphanage.'),
], ctrl.register);

router.post('/login', [
  body('email').isEmail(),
  body('password').notEmpty(),
], ctrl.login);

router.get('/verify-email',       ctrl.verifyEmail);
router.post('/forgot-password',   ctrl.forgotPassword);
router.post('/reset-password',    ctrl.resetPassword);
router.get('/me', protect,        ctrl.getMe);

// Change password (authenticated)
router.put('/change-password', protect, async (req, res, next) => {
  try {
    const bcrypt = require('bcryptjs');
    const db     = require('../config/db');
    const { createError } = require('../middleware/error');
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password)
      return next(createError(400, 'Both passwords are required.'));
    if (new_password.length < 8)
      return next(createError(400, 'New password must be at least 8 characters.'));

    const [rows] = await db.query(
      'SELECT password_hash FROM users WHERE user_id = ?', [req.user.user_id]
    );
    if (!rows.length) return next(createError(404, 'User not found.'));

    const ok = await bcrypt.compare(current_password, rows[0].password_hash);
    if (!ok) return next(createError(401, 'Current password is incorrect.'));

    const hash = await bcrypt.hash(new_password, 10);
    await db.query('UPDATE users SET password_hash = ? WHERE user_id = ?', [hash, req.user.user_id]);
    res.json({ message: 'Password changed successfully.' });
  } catch (err) { next(err); }
});

module.exports = router;
