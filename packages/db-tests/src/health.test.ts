import { describe, expect, it } from 'vitest';
import { getStack } from './stack';

/** The `health` Edge Function is served by the local edge runtime started with the stack. */
describe('health Edge Function', () => {
  const url = () => `${getStack().apiUrl}/functions/v1/health`;

  it('reports ok with a database round-trip and nothing else', async () => {
    const response = await fetch(url());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = (await response.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['db', 'latencyMs', 'status']);
    expect(body).toMatchObject({ status: 'ok', db: 'ok' });
    expect(typeof body.latencyMs).toBe('number');
  });

  it('is callable without credentials (public liveness probe) yet leaks no data', async () => {
    const response = await fetch(url());
    const text = await response.text();
    expect(text).not.toMatch(/eyJ|sb_|key|secret|password|postgres/i);
  });

  it('supports HEAD without a body', async () => {
    const response = await fetch(url(), { method: 'HEAD' });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
  });

  it('rejects methods that make no sense for a probe', async () => {
    const response = await fetch(url(), { method: 'POST', body: '{}' });
    expect(response.status).toBe(405);
  });
});
