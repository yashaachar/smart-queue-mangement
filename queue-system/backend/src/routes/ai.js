const express = require('express');
const jwt = require('jsonwebtoken');
const { chatAssistant, getOperationalInsights } = require('../controllers/aiController');
const { authenticate, requireStaff } = require('../middleware/auth');

const router = express.Router();

// Optional authentication helper: extracts user if token provided without throwing 401
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET);
    } catch (_) {}
  }
  next();
};

/**
 * POST /api/ai/chat
 * Interactive queue assistant (authenticated or guest).
 */
router.post('/chat', optionalAuth, chatAssistant);

/**
 * GET /api/ai/insights
 * Staff/Admin: Automated operational digest and recommendation summary.
 */
router.get('/insights', authenticate, requireStaff, getOperationalInsights);

module.exports = router;

