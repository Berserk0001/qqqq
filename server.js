import Fastify from 'fastify';
import hhproxy from './proxy1.js';
const PORT = process.env.PORT || 8080;

const fastify = Fastify({ logger: true });

fastify.get('/favicon.ico', (req, reply) => reply.code(204).send())

fastify.get('/', async (request, reply) => {
  await hhproxy(request, reply);
});

try {
    fastify.listen({ host: '0.0.0.0', port: PORT });
    console.log(`Listening on ${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
