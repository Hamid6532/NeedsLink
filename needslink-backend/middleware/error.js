// Wrap async route handlers to catch errors without try/catch in every controller
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Global error handler — must be registered last in app.js
const errorHandler = (err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] ERROR:`, err.message);

  // MySQL duplicate entry
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ message: 'A record with that value already exists.' });
  }

  // MySQL foreign key violation
  if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    return res.status(400).json({ message: 'Referenced record does not exist.' });
  }

  const statusCode = err.statusCode || 500;
  const message    = err.statusCode ? err.message : 'Internal server error.';

  res.status(statusCode).json({ message });
};

// Create a typed HTTP error
const createError = (statusCode, message) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

module.exports = { asyncHandler, errorHandler, createError };
