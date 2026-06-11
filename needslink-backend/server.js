require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const path     = require('path');

const { errorHandler } = require('./middleware/error');

// Route modules
const authRoutes           = require('./routes/auth');
const orphanageRoutes      = require('./routes/orphanages');
const orphanagePrivRoutes  = require('./routes/orphanagePrivate');
const needsRoutes          = require('./routes/needs');
const donorRoutes          = require('./routes/donor');
const updatesRoutes        = require('./routes/updates');
const messagesRoutes       = require('./routes/messages');
const adminRoutes          = require('./routes/admin');

const app = express();

// ── Middleware ─────────────────────────────────────────────
app.use(cors({
  origin:      process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded images statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Routes ─────────────────────────────────────────────────
app.use('/api/auth',       authRoutes);
app.use('/api/orphanages', orphanageRoutes);
app.use('/api/orphanage',  orphanagePrivRoutes);
app.use('/api/needs',      needsRoutes);
app.use('/api',            donorRoutes);       // /api/bookmarks, /api/interests, /api/donor/*
app.use('/api/updates',    updatesRoutes);
app.use('/api/messages',   messagesRoutes);
app.use('/api/admin',      adminRoutes);

// ── Health check ───────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── 404 handler ────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.method} ${req.path} not found.` });
});

// ── Global error handler ───────────────────────────────────
app.use(errorHandler);

// ── Start ──────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`NeedsLink API running on http://localhost:${PORT}`);
});

module.exports = app;
