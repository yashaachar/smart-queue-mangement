const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { logActivity, getRequestMeta } = require('../utils/logger');

const SALT_ROUNDS = 12;

/**
 * POST /api/auth/register
 * Body: { username, email, password, role? }
 */
const register = async (req, res, next) => {
  const { username, email, password, role } = req.body;

  try {
    // Hash password — never store plain text
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // Only allow 'user' or 'staff' on self-registration; 'admin' must be seeded manually
    const assignedRole = role === 'staff' ? 'staff' : 'user';

    const result = await pool.query(
      `INSERT INTO users (username, email, password, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, email, role, created_at`,
      [username.trim(), email.toLowerCase().trim(), hashedPassword, assignedRole]
    );

    const user = result.rows[0];

    await logActivity('USER_REGISTERED', {
      performedBy: { userId: user.id, username: user.username, role: user.role },
      details: { email: user.email },
      ...getRequestMeta(req),
    });

    const token = signToken(user);

    return res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: { user: sanitizeUser(user), token },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
const login = async (req, res, next) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query(
      'SELECT id, username, email, password, role FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    const user = result.rows[0];

    if (!user) {
      await logActivity('USER_LOGIN_FAILED', {
        details: { email, reason: 'User not found' },
        ...getRequestMeta(req),
      });
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      await logActivity('USER_LOGIN_FAILED', {
        details: { email, reason: 'Wrong password' },
        ...getRequestMeta(req),
      });
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    await logActivity('USER_LOGIN', {
      performedBy: { userId: user.id, username: user.username, role: user.role },
      ...getRequestMeta(req),
    });

    const token = signToken(user);

    return res.json({
      success: true,
      message: 'Login successful',
      data: { user: sanitizeUser(user), token },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/auth/me   (requires authenticate middleware)
 */
const getMe = async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, role, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    return res.json({ success: true, data: { user: result.rows[0] } });
  } catch (err) {
    next(err);
  }
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const signToken = (user) =>
  jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );

const sanitizeUser = (user) => ({
  id: user.id,
  username: user.username,
  email: user.email,
  role: user.role,
  created_at: user.created_at,
});

module.exports = { register, login, getMe };
