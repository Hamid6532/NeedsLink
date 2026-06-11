const bcrypt      = require('bcryptjs');
const jwt         = require('jsonwebtoken');
const crypto      = require('crypto');
const { validationResult } = require('express-validator');
const db          = require('../config/db');
const { asyncHandler, createError } = require('../middleware/error');
const { sendMail, emailTemplates }  = require('../utils/email');
require('dotenv').config();

const signToken = (user) =>
  jwt.sign(
    { user_id: user.user_id, role: user.role, name: user.name, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '30m' }
  );

// POST /api/auth/register
const register = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

  const { name, email, password, role, org_name, location, contact_person, phone, description } = req.body;

  // Check email uniqueness
  const [existing] = await db.query('SELECT user_id FROM users WHERE email = ?', [email]);
  if (existing.length) throw createError(409, 'An account with that email already exists.');

  const password_hash = await bcrypt.hash(password, 10);

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [userResult] = await conn.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [name, email, password_hash, role]
    );
    const user_id = userResult.insertId;

    if (role === 'orphanage') {
      await conn.query(
        `INSERT INTO orphanages (user_id, org_name, location, contact_person, phone, description)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [user_id, org_name || name, location || '', contact_person || name, phone || null, description || null]
      );
    }

    if (role === 'donor') {
      await conn.query('INSERT INTO donor_profiles (user_id) VALUES (?)', [user_id]);
    }

    // Email verification token
    const token      = crypto.randomBytes(32).toString('hex');
    const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await conn.query(
      'INSERT INTO email_verifications (user_id, token, expires_at) VALUES (?, ?, ?)',
      [user_id, token, expires_at]
    );

    await conn.commit();

    const tmpl = emailTemplates.verifyEmail(name, token);
    await sendMail({ to: email, ...tmpl });

    res.status(201).json({
      message: 'Registration successful. Please check your email to verify your account.',
    });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

// POST /api/auth/login
const login = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

  const { email, password } = req.body;

  const [rows] = await db.query(
    'SELECT user_id, name, email, password_hash, role, status, email_verified FROM users WHERE email = ?',
    [email]
  );
  const user = rows[0];

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw createError(401, 'Invalid email or password.');
  }

  if (user.status === 'suspended') throw createError(403, 'Your account has been suspended. Contact support.');
  if (user.status === 'deleted')   throw createError(403, 'Account not found.');
  if (!user.email_verified)        throw createError(403, 'Please verify your email before logging in.');

  const token = signToken(user);

  // Fetch extended profile
  let profile = null;
  if (user.role === 'orphanage') {
    const [p] = await db.query('SELECT * FROM orphanages WHERE user_id = ?', [user.user_id]);
    profile = p[0] || null;
  }
  if (user.role === 'donor') {
    const [p] = await db.query('SELECT * FROM donor_profiles WHERE user_id = ?', [user.user_id]);
    profile = p[0] || null;
  }

  res.json({
    token,
    user: {
      user_id:        user.user_id,
      name:           user.name,
      email:          user.email,
      role:           user.role,
      email_verified: user.email_verified,
      profile,
    },
  });
});

// GET /api/auth/verify-email?token=xxx
const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.query;
  if (!token) throw createError(400, 'Verification token is required.');

  const [rows] = await db.query(
    `SELECT ev_id, user_id, expires_at, verified_at
     FROM email_verifications WHERE token = ?`,
    [token]
  );
  const record = rows[0];

  if (!record)            throw createError(400, 'Invalid verification token.');
  if (record.verified_at) return res.json({ message: 'Email already verified. You can log in.' });
  if (new Date(record.expires_at) < new Date()) throw createError(400, 'Token has expired. Please register again.');

  await db.query('UPDATE users SET email_verified = 1 WHERE user_id = ?', [record.user_id]);
  await db.query('UPDATE email_verifications SET verified_at = NOW() WHERE ev_id = ?', [record.ev_id]);

  res.json({ message: 'Email verified successfully. You can now log in.' });
});

// POST /api/auth/forgot-password
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) throw createError(400, 'Email is required.');

  const [rows] = await db.query('SELECT user_id, name FROM users WHERE email = ?', [email]);
  // Always return success to prevent email enumeration
  if (!rows.length) return res.json({ message: 'If that email exists, a reset link has been sent.' });

  const { user_id, name } = rows[0];
  const token      = crypto.randomBytes(32).toString('hex');
  const expires_at = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db.query(
    `INSERT INTO password_reset_tokens (user_id, token, expires_at)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE token = VALUES(token), expires_at = VALUES(expires_at), used = 0`,
    [user_id, token, expires_at]
  );

  const tmpl = emailTemplates.resetPassword(name, token);
  await sendMail({ to: email, ...tmpl });

  res.json({ message: 'If that email exists, a reset link has been sent.' });
});

// POST /api/auth/reset-password
const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) throw createError(400, 'Token and new password are required.');
  if (password.length < 8)  throw createError(400, 'Password must be at least 8 characters.');

  const [rows] = await db.query(
    'SELECT token_id, user_id, expires_at, used FROM password_reset_tokens WHERE token = ?',
    [token]
  );
  const record = rows[0];

  if (!record || record.used)             throw createError(400, 'Invalid or already used token.');
  if (new Date(record.expires_at) < new Date()) throw createError(400, 'Token has expired. Please request a new one.');

  const password_hash = await bcrypt.hash(password, 10);

  await db.query('UPDATE users SET password_hash = ? WHERE user_id = ?', [password_hash, record.user_id]);
  await db.query('UPDATE password_reset_tokens SET used = 1 WHERE token_id = ?', [record.token_id]);

  res.json({ message: 'Password reset successfully. You can now log in.' });
});

// GET /api/auth/me
const getMe = asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    'SELECT user_id, name, email, role, status, email_verified, created_at FROM users WHERE user_id = ?',
    [req.user.user_id]
  );
  if (!rows.length) throw createError(404, 'User not found.');

  const user = rows[0];
  let profile = null;

  if (user.role === 'orphanage') {
    const [p] = await db.query('SELECT * FROM orphanages WHERE user_id = ?', [user.user_id]);
    profile = p[0] || null;
  }
  if (user.role === 'donor') {
    const [p] = await db.query('SELECT * FROM donor_profiles WHERE user_id = ?', [user.user_id]);
    profile = p[0] || null;
  }

  res.json({ user: { ...user, profile } });
});

module.exports = { register, login, verifyEmail, forgotPassword, resetPassword, getMe };
