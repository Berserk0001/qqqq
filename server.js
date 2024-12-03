// server.js
import Fastify from 'fastify';
import hhproxy from './proxy1.js';

const fastify = Fastify({
  logger: false,
});

// Register proxy route
fastify.get('/', hhproxy);

// Start server
const start = async () => {
  try {
    await fastify.listen(8080);
    fastify.log.info(`Server running at http://localhost:3000/`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
