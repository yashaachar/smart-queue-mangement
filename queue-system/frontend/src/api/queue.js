import api from './axios';

// ── Queue & Service Definitions ───────────────────────────────────────────────
export const getQueueStatus = () => api.get('/queue/status');
export const getServices = () => api.get('/services');
export const getCounters = () => api.get('/services/counters');

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
export const advanceQueue = (counterId = 1) => callNext(counterId); // alias
export const startServing = (counterId = 1) => api.post('/queue/start-serving', { counter_id: counterId });
export const completeService = (counterId = 1) => api.post('/queue/complete', { counter_id: counterId });
export const skipToken = (counterId = 1) => api.post('/queue/skip', { counter_id: counterId });
export const resetQueue = () => api.post('/queue/reset');
export const toggleQueue = () => api.patch('/queue/toggle');
export const getActivityLogs = (page = 1) => api.get(`/queue/logs?page=${page}&limit=20`);
