import { describe, it, expect } from 'vitest';
import { createServer } from './index.js';

describe('Leash Gateway API', () => {
  it('returns healthy status from /health', async () => {
    const server = await createServer();
    const res = await server.inject({
      method: 'GET',
      url: '/health'
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('leash-gateway');
  });
});
