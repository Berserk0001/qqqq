#!/usr/bin/env node
'use strict';


import Fastify from 'fastify';
import hhproxy from './proxy1.js';

const fastify = Fastify({
  logger: true,
});

const PORT = process.env.PORT || 8080;

// Set up the route
fastify.get('/', async (req, res) => {
  return proxy(req, res);
});

// Start the server

  try {
    fastify.listen({ host: '0.0.0.0', port: PORT });
    console.log(`Listening on ${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
