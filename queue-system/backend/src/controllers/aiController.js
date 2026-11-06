const { processAssistantQuery, generateOperationalDigest } = require('../services/aiAssistantService');

/**
 * POST /api/ai/chat
 * Customer interactive queue assistant.
 */
const chatAssistant = async (req, res, next) => {
  try {
    const { message } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }

    const userId = req.user?.id || null;
    const response = await processAssistantQuery(message, userId);

    return res.json({
      success: true,
      data: response,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/ai/insights
 * Executive operational summary digest for staff and management.
 */
const getOperationalInsights = async (req, res, next) => {
  try {
    const digest = await generateOperationalDigest();
    return res.json({
      success: true,
      data: digest,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { chatAssistant, getOperationalInsights };

