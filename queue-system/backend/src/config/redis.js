const Redis = require('ioredis');

let redisClient = null;

const connectRedis = () => {
  redisClient = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    // Only set password if provided — local installs often have none
    ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
    retryStrategy: (times) => {
      // Exponential backoff, max 10s
      return Math.min(times * 200, 10000);
    },
    maxRetriesPerRequest: 3,
    lazyConnect: false,
  });

  redisClient.on('connect', () => {
    console.log('[Redis] Connected successfully');
  });

  redisClient.on('error', (err) => {
    console.error('[Redis] Connection error:', err.message);
  });

  redisClient.on('reconnecting', () => {
    console.warn('[Redis] Reconnecting...');
  });

  return redisClient;
};

const getRedis = () => {
  if (!redisClient) {
    throw new Error('Redis client not initialized. Call connectRedis() first.');
  }
  return redisClient;
};

module.exports = { connectRedis, getRedis };
