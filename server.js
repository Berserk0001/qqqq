import Fastify from 'fastify';
import hhproxy from './proxy1.js';

const fastify = Fastify({ logger: true });

fastify.get('/', async (request, reply) => {
  await hhproxy(request, reply);
});

fastify.listen(3000, (err, address) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  fastify.log.info(`Server listening on ${address}`);
});
