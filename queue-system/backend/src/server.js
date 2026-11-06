require('dotenv').config();

const app = require('./app');
const { connectPostgres } = require('./config/db');
const { connectMongo } = require('./config/mongo');
const { connectRedis } = require('./config/redis');

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // Connect to all data stores before accepting traffic
    await connectPostgres();
    await connectMongo();
    connectRedis(); // synchronous setup; errors surface via event emitter

    app.listen(PORT, () => {
      console.log(`[Server] Quebee Smart Queue API running on port ${PORT}`);
      console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (err) {
    console.error('[Server] Failed to start:', err.message);
    process.exit(1);
  }
};

startServer();
