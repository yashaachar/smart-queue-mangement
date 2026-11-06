/**
 * QUEBEE AI ASSISTANT & OPERATIONAL INSIGHTS ENGINE
 * Specifications: PS-13 Section 7 (Balanced & Explainable AI)
 *
 * Privacy-preserving customer queue assistant & operational summary generator.
 * Operates offline with deterministic domain grounding and optional LLM provider enhancement.
 */

const { pool } = require('../config/db');
const { getAnalyticsData } = require('./analyticsService');
const { estimateWaitTime } = require('./waitEstimationEngine');

/**
 * Knowledge Base for Common Queue Inquiries
 */
const FAQ_KNOWLEDGE_BASE = [
  {
    keywords: ['medical', 'doctor', 'pain', 'sick', 'diagnose', 'symptom', 'emergency', 'triage', 'medicine'],
    reply: 'I am a queue optimization assistant and cannot provide clinical advice or medical diagnosis. For health emergencies, please alert the triage desk immediately or call local emergency services (e.g. 112 / 911).',
  },
  {
    keywords: ['how long', 'wait', 'time', 'estimate', 'duration', 'delay', 'minutes', 'when'],
    reply: (userToken, waitEst) => {
      if (userToken) {
        return `For your ticket (${userToken.token_code || '#' + userToken.token_number}), the estimated waiting time is ${userToken.formatted_range || `${userToken.estimated_wait_min} minutes`}. Confidence level: ${userToken.confidence || 'standard'}. Note: This is an empirical estimate that adapts based on counter capacity.`;
      }
      return `Current queue waiting time estimate across active desks is ${waitEst?.formattedRange || '3–7 minutes'}. Take a ticket to see your personalized position estimate.`;
    },
  },
  {
    keywords: ['position', 'place', 'line', 'ahead', 'where am i', 'my number'],
    reply: (userToken) => {
      if (userToken) {
        return `Your current active ticket is ${userToken.token_code || '#' + userToken.token_number} (${userToken.service_name || 'General'}). Status: ${userToken.status.toUpperCase()}. There are ${userToken.position_ahead || 0} customer(s) ahead of you in line.`;
      }
      return 'You do not have an active ticket currently. You can request one anytime from the "Take Token" section.';
    },
  },
  {
    keywords: ['cancel', 'surrender', 'delete', 'leave', 'drop'],
    reply: 'You can cancel your waiting ticket at any time by viewing your active ticket on the "My Ticket" page and clicking the "Cancel Ticket" button. Your spot in the queue will be surrendered immediately.',
  },
  {
    keywords: ['status', 'meaning', 'called', 'serving', 'what does', 'states'],
    reply: 'Ticket statuses in Quebee:\n• WAITING: You are in line. Watch for your number on the display board.\n• CALLED: Your number has been called! Please proceed immediately to your assigned counter.\n• SERVING: Your consultation is currently in progress.\n• COMPLETED: Your service has finished.\n• CANCELLED: The ticket was cancelled by you or staff.',
  },
  {
    keywords: ['generate', 'take token', 'get token', 'take a ticket', 'join queue', 'enter line', 'how do i'],
    reply: 'To get a token, navigate to the "My Ticket" or "Take Token" page, select your desired service department (e.g. General Inquiries, Express Desk), select your priority tier if applicable, and click "Get Queue Token". You will receive a unique sequential token code (e.g. A-101).',
  },
];

/**
 * Handles customer assistant inquiries.
 */
const processAssistantQuery = async (queryText, userId = null) => {
  const normalized = (queryText || '').toLowerCase().trim();

  // 1. Fetch user's active token if logged in
  let userToken = null;
  if (userId) {
    const tRes = await pool.query(
      `SELECT t.id, t.token_number, t.token_code, t.status, t.priority, t.issued_at,
              s.name AS service_name, s.estimated_duration_min,
              c.name AS counter_name
       FROM tokens t
       LEFT JOIN services s ON t.service_id = s.id
       LEFT JOIN counters c ON t.counter_id = c.id
       WHERE t.user_id = $1 AND t.status IN ('waiting', 'called', 'serving')
       ORDER BY t.issued_at DESC
       LIMIT 1`,
      [userId]
    );

    if (tRes.rows[0]) {
      const raw = tRes.rows[0];
      const waitEst = await estimateWaitTime({
        serviceId: raw.service_id,
        tokenId: raw.id,
        priority: raw.priority,
        issuedAt: raw.issued_at,
      });
      userToken = {
        ...raw,
        position_ahead: waitEst.positionAhead,
        estimated_wait_min: waitEst.estimatedWaitMin,
        formatted_range: waitEst.formattedRange,
        confidence: waitEst.confidence,
      };
    }
  }

  // 2. Fetch general wait estimate
  const generalWait = await estimateWaitTime();

  // 3. Match against Knowledge Base
  for (const item of FAQ_KNOWLEDGE_BASE) {
    const match = item.keywords.some((kw) => normalized.includes(kw));
    if (match) {
      const response = typeof item.reply === 'function' ? item.reply(userToken, generalWait) : item.reply;
      return {
        reply: response,
        topic: item.keywords[0],
        disclaimer: 'Quebee Assistant provides queue navigation only. Personal customer records are protected.',
      };
    }
  }

  // Fallback response with helpful options
  return {
    reply: "I'm the Quebee Queue Assistant! I can help you with:\n1. Checking your queue position and estimated wait time\n2. Instructions on taking or cancelling a digital ticket\n3. Understanding counter announcements and ticket statuses\n\nHow can I help you today?",
    topic: 'general_help',
    disclaimer: 'Quebee Assistant provides queue navigation only. Personal customer records are protected.',
  };
};

/**
 * Generates automated executive operational insights digest for staff and management.
 */
const generateOperationalDigest = async () => {
  const analytics = await getAnalyticsData();
  const { kpis, hourlyDistribution, servicePerformance, counterUtilization, recommendations } = analytics;

  // Identify busiest service
  const sortedServices = [...servicePerformance].sort((a, b) => b.total_requests - a.total_requests);
  const busiestService = sortedServices[0] || null;

  // Identify peak hour
  const sortedHours = [...hourlyDistribution].sort((a, b) => b.token_volume - a.token_volume);
  const peakHour = sortedHours[0] || null;

  const summaryBullets = [];

  if (kpis.totalTokens > 0) {
    summaryBullets.push(
      `Total traffic: ${kpis.totalTokens} tickets registered with an overall completion rate of ${kpis.completionRate}%.`
    );
  }

  if (peakHour) {
    summaryBullets.push(
      `Peak arrival window identified at ${peakHour.hour_of_day}:00–${peakHour.hour_of_day + 1}:00 with ${peakHour.token_volume} customer requests.`
    );
  }

  if (busiestService) {
    summaryBullets.push(
      `Highest demand service: "${busiestService.name}" representing ${busiestService.total_requests} tickets.`
    );
  }

  summaryBullets.push(
    `Average wait time across all counters is ${kpis.avgWaitMinutes} minutes; average consultation duration is ${kpis.avgServiceMinutes} minutes.`
  );

  return {
    title: 'Quebee Intelligent Operational Digest',
    generatedAt: new Date().toISOString(),
    executiveSummary: summaryBullets,
    recommendations,
    kpis,
    busiestService: busiestService ? { name: busiestService.name, volume: busiestService.total_requests } : null,
    peakHour: peakHour ? { hour: `${peakHour.hour_of_day}:00`, volume: peakHour.token_volume } : null,
  };
};

module.exports = { processAssistantQuery, generateOperationalDigest };
