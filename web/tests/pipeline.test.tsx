import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createApiClient } from '../lib/data/api';
import { MessageBubble } from '../components/inbox/message-bubble';
import type { Message } from '../lib/data';

it('preserves the outgoing intent key and strips it from the API body', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: { id: 'message' } }) });
  const client = createApiClient({ vendorId: 'vendor', getToken: async () => 'token', fetcher });
  await client.messages.send({
    conversationId: 'conversation',
    text: 'Good afternoon',
    idempotencyKey: 'stable-intent-key-123',
  });
  const [url, init] = fetcher.mock.calls[0];
  expect(url).toBe('/api/v1/messages');
  expect(init.headers['Idempotency-Key']).toBe('stable-intent-key-123');
  expect(JSON.parse(init.body)).toEqual({ conversationId: 'conversation', text: 'Good afternoon' });
});

const message = {
  id: 'one',
  vendorId: 'vendor',
  conversationId: 'thread',
  sender: 'vendor',
  kind: 'text',
  text: 'Thank you',
  createdAt: '2026-11-10T10:00:00Z',
  language: 'en',
  status: 'failed',
  deliveryErrorCode: 'DELIVERY_UNCERTAIN',
} as Message;
it('shows ambiguous failure without falsely claiming delivery or inviting duplicate send', () => {
  render(<MessageBubble message={message} />);
  expect(screen.getByRole('status').textContent).toContain('retry only reconciles');
});
it('labels Gmail acceptance separately from recipient delivery', () => {
  render(<MessageBubble message={{ ...message, status: 'sent' }} />);
  expect(screen.getByText(/recipient delivery is not confirmed/)).toBeInTheDocument();
});
