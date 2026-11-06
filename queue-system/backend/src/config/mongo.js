const mongoose = require('mongoose');

const connectMongo = async () => {
  const uri = process.env.MONGO_URI || 'mongodb://mongouser:mongopass@localhost:27017/queue_logs?authSource=admin';

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000,
  });

  console.log('[MongoDB] Connected successfully');

  mongoose.connection.on('error', (err) => {
    console.error('[MongoDB] Connection error:', err.message);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[MongoDB] Disconnected');
  });
};

module.exports = { connectMongo };
