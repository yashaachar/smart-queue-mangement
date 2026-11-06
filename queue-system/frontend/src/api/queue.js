import api from './axios';

// ── Queue & Service Definitions ───────────────────────────────────────────────
export const getQueueStatus = () => api.get('/queue/status');
export const getServices = () => api.get('/services');
export const getCounters = () => api.get('/services/counters');

// ── Server-Sent Events (SSE) Real-Time Push Stream ───────────────────────────
export const subscribeQueueStream = (onUpdate, onError) => {
  if (typeof window === 'undefined' || !window.EventSource) {
    if (onError) onError(new Error('EventSource not supported'));
    return () => {};
  }

  const streamUrl = '/api/queue/stream';
  const es = new EventSource(streamUrl);

  es.addEventListener('queue_update', (event) => {
    try {
      const data = JSON.parse(event.data);
      if (onUpdate) onUpdate(data);
    } catch (err) {
      console.warn('[SSE] Error parsing queue update:', err);
    }
  });

  es.onerror = (err) => {
    if (onError) onError(err);
  };

  return () => {
    es.close();
  };
};

// ── Tokens ────────────────────────────────────────────────────────────────────
export const generateToken = (payload = {}) => api.post('/tokens/generate', payload);
export const getMyToken = () => api.get('/tokens/my');
export const cancelToken = (tokenId) => api.post(`/tokens/${tokenId}/cancel`);
export const getAllTokens = (page = 1, status = '', serviceId = '') => {
  let url = `/tokens?page=${page}&limit=20`;
  if (status) url += `&status=${status}`;
  if (serviceId) url += `&service_id=${serviceId}`;
  return api.get(url);
};

// ── Staff Counter Dispatch Operations ─────────────────────────────────────────
export const callNext = (counterId = 1) => api.post('/queue/next', { counter_id: counterId });
export const advanceQueue = (counterId = 1) => callNext(counterId);
export const startServing = (counterId = 1) => api.post('/queue/start-serving', { counter_id: counterId });
export const completeService = (counterId = 1) => api.post('/queue/complete', { counter_id: counterId });
export const skipToken = (counterId = 1) => api.post('/queue/skip', { counter_id: counterId });
export const resetQueue = () => api.post('/queue/reset');
export const toggleQueue = () => api.patch('/queue/toggle');
export const getActivityLogs = (page = 1) => api.get(`/queue/logs?page=${page}&limit=20`);

// ── Analytics & Bottleneck Optimization (PS-13 Outcomes 4 & 5) ────────────────
export const getAnalytics = (params = {}) => api.get('/analytics', { params });
export const exportAnalyticsCsv = () => api.get('/analytics/export', { responseType: 'blob' });

// ── AI Queue Assistant & Insights ─────────────────────────────────────────────
export const askAIAssistant = (message) => api.post('/ai/chat', { message });
export const getAIOperationalDigest = () => api.get('/ai/insights');
