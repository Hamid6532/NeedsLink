const db = require('../config/db');
const { asyncHandler, createError } = require('../middleware/error');

// POST /api/messages
const sendMessage = asyncHandler(async (req, res) => {
  const { receiver_id, content } = req.body;
  if (!receiver_id || !content?.trim()) throw createError(400, 'receiver_id and content are required.');
  if (parseInt(receiver_id) === req.user.user_id) throw createError(400, 'Cannot message yourself.');

  const [recv] = await db.query('SELECT user_id, name FROM users WHERE user_id = ? AND status = "active"', [receiver_id]);
  if (!recv.length) throw createError(404, 'Recipient not found.');

  const [result] = await db.query(
    'INSERT INTO messages (sender_id, receiver_id, content) VALUES (?, ?, ?)',
    [req.user.user_id, receiver_id, content.trim()]
  );

  const [msg] = await db.query('SELECT * FROM messages WHERE message_id = ?', [result.insertId]);
  res.status(201).json({ message: msg[0] });
});

// GET /api/messages/conversations — list all unique threads
const getConversations = asyncHandler(async (req, res) => {
  const user_id = req.user.user_id;

  const [convs] = await db.query(
    `SELECT
       LEAST(sender_id, receiver_id)    AS user_a_id,
       GREATEST(sender_id, receiver_id) AS user_b_id,
       MAX(sent_at)                     AS last_message_at,
       COUNT(*)                         AS message_count,
       SUM(is_read = 0 AND receiver_id = ?) AS unread_count,
       SUBSTRING_INDEX(GROUP_CONCAT(content ORDER BY sent_at DESC SEPARATOR '|||'), '|||', 1) AS last_message_preview
     FROM messages
     WHERE sender_id = ? OR receiver_id = ?
     GROUP BY LEAST(sender_id, receiver_id), GREATEST(sender_id, receiver_id)
     ORDER BY last_message_at DESC`,
    [user_id, user_id, user_id]
  );

  // Enrich with other user's name
  for (const c of convs) {
    const otherId = c.user_a_id === user_id ? c.user_b_id : c.user_a_id;
    const [u] = await db.query('SELECT user_id, name, role FROM users WHERE user_id = ?', [otherId]);
    c.user_a_name = user_id === c.user_a_id ? req.user.name : u[0]?.name;
    c.user_b_name = user_id === c.user_b_id ? req.user.name : u[0]?.name;
    c.other_user  = u[0] || null;
    // clip preview
    if (c.last_message_preview?.length > 60) {
      c.last_message_preview = c.last_message_preview.slice(0, 60) + '…';
    }
  }

  res.json({ conversations: convs });
});

// GET /api/messages/:userId — full thread with a user
const getThread = asyncHandler(async (req, res) => {
  const my_id    = req.user.user_id;
  const other_id = parseInt(req.params.userId);

  const [messages] = await db.query(
    `SELECT * FROM messages
     WHERE (sender_id = ? AND receiver_id = ?)
        OR (sender_id = ? AND receiver_id = ?)
     ORDER BY sent_at ASC`,
    [my_id, other_id, other_id, my_id]
  );

  // Mark received messages as read
  await db.query(
    'UPDATE messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ? AND is_read = 0',
    [other_id, my_id]
  );

  const [other] = await db.query('SELECT user_id, name, role FROM users WHERE user_id = ?', [other_id]);

  res.json({ messages, other_user: other[0] || null });
});

module.exports = { sendMessage, getConversations, getThread };
