import Fastify from 'fastify';
import { config } from './config.js';
import { logger } from '@leash/shared';
import { handleRequestPaymentTool } from './mcp/index.js';
import { PaymentRequestSchema } from '@leash/mandates';

export async function createServer() {
  const app = Fastify({ logger: false });

  app.get('/health', async () => ({
    status: 'ok',
    service: 'leash-gateway',
    timestamp: new Date().toISOString()
  }));

  app.post('/api/v1/payment/request', async (req, reply) => {
    try {
      const parsed = PaymentRequestSchema.parse(req.body);
      const result = await handleRequestPaymentTool(parsed);
      return result;
    } catch (err) {
      reply.status(400);
      return { error: 'Invalid payment request', details: String(err) };
    }
  });

  return app;
}

if (process.env.NODE_ENV !== 'test') {
  const app = await createServer();
  app.listen({ port: config.port, host: '0.0.0.0' }, (err, address) => {
    if (err) {
      logger.error('Gateway startup error', { error: String(err) });
      process.exit(1);
    }
    logger.info(`Leash Gateway running on ${address}`);
  });
}
