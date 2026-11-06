/**
 * QUEBEE SERVER-SENT EVENTS (SSE) REAL-TIME HUB
 * Specification: PS-13 Real-time push for Public Displays & Customer Tickets
 */

const { getQueueStatusPayload } = require('../utils/queueStateHelper');

// Active client response streams
const clients = new Set();

/**
 * Express Route Handler: GET /api/queue/stream
 * Connects a client to the real-time event stream.
 */
const handleSSEConnection = async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable proxy buffering (Nginx, Caddy)
    'Access-Control-Allow-Origin': req.headers.origin || '*',
    'Access-Control-Allow-Credentials': 'true',
  });

  // Send initial connection ACK and full queue snapshot
  res.write(`event: connected\ndata: ${JSON.stringify({ message: 'Connected to Quebee Real-time Stream' })}\n\n`);

  try {
    const initialStatus = await getQueueStatusPayload();
    res.write(`event: queue_update\ndata: ${JSON.stringify(initialStatus)}\n\n`);
  } catch (err) {
    console.error('[SSE] Failed to send initial snapshot:', err.message);
  }

  // Register client
  clients.add(res);
  console.log(`[SSE] Client connected. Active streams: ${clients.size}`);

  // Heartbeat interval to prevent socket timeout (every 25 seconds)
  const heartbeat = setInterval(() => {
    try {
      res.write(': keep-alive\n\n');
    } catch (_) {
      clearInterval(heartbeat);
      clients.delete(res);
    }
  }, 25000);

  // Clean up on disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(res);
    console.log(`[SSE] Client disconnected. Active streams: ${clients.size}`);
  });
};

/**
 * Broadcasts an event to all connected SSE clients.
 *
 * @param {string} eventName - e.g. 'queue_update', 'token_called', 'token_served'
 * @param {object} payload - Event payload
 */
const broadcastSSE = (eventName, payload) => {
  if (clients.size === 0) return;

  const dataStr = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;

  for (const client of clients) {
    try {
      client.write(dataStr);
    } catch (err) {
      clients.delete(client);
    }
  }
};

/**
 * Helper: Broadcasts the latest queue status to all connected displays and tickets.
 */
const notifyQueueUpdate = async () => {
  try {
    const payload = await getQueueStatusPayload();
    broadcastSSE('queue_update', payload);
  } catch (err) {
    console.error('[SSE] Failed to broadcast queue update:', err.message);
  }
};

module.exports = {
  handleSSEConnection,
  broadcastSSE,
  notifyQueueUpdate,
  getActiveClientCount: () => clients.size,
};

