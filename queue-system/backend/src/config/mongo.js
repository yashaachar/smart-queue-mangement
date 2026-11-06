const mongoose = require('mongoose');

const connectMongo = async () => {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/queue_logs';

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 4000,
    });
    console.log('[MongoDB] Connected successfully');
  } catch (err) {
    // If auth failed because local install doesn't require auth credentials, retry without them
    if (uri.includes('@') && (err.message.includes('Authentication failed') || err.message.includes('auth failed'))) {
      try {
        const fallbackUri = uri.replace(/\/\/[^@]+@/, '//').split('?')[0];
        console.warn(`[MongoDB] Authentication failed with credentials. Attempting fallback: ${fallbackUri}`);
        await mongoose.connect(fallbackUri, {
          serverSelectionTimeoutMS: 4000,
        });
        console.log('[MongoDB] Connected successfully via fallback URI');
        return;
      } catch (fallbackErr) {
        console.error('[MongoDB] Fallback connection failed:', fallbackErr.message);
      }
    }
    console.error('[MongoDB] Connection error (continuing without blocking core queue):', err.message);
  }

  mongoose.connection.on('error', (err) => {
    console.error('[MongoDB] Runtime error:', err.message);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[MongoDB] Disconnected');
  });
};

module.exports = { connectMongo };
