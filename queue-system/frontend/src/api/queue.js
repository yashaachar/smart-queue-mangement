import api from './axios';

export const getQueueStatus = () => api.get('/queue/status');
export const advanceQueue = () => api.post('/queue/next');
export const resetQueue = () => api.post('/queue/reset');
export const toggleQueue = () => api.patch('/queue/toggle');
export const getActivityLogs = (page = 1) => api.get(`/queue/logs?page=${page}&limit=20`);

export const generateToken = () => api.post('/tokens/generate');
export const getMyToken = () => api.get('/tokens/my');
export const getAllTokens = (page = 1, status = '') =>
  api.get(`/tokens?page=${page}&limit=20${status ? `&status=${status}` : ''}`);
