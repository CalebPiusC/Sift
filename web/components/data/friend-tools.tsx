'use client';
import { useState } from 'react';
import { useDataClient } from './provider';
import { authConfigured, supabase } from '../../lib/supabase';
export function FriendTools() {
  const { client } = useDataClient();
  const [status, setStatus] = useState('');
  const [report, setReport] = useState('');
  const [busy, setBusy] = useState(false);
  if (client.mode !== 'api' || !client.vendorId) return null;
  async function request(path: string, method = 'GET', body?: unknown) {
    if (!authConfigured()) throw new Error('Sign in first.');
    const { data } = await supabase().auth.getSession();
    if (!data.session) throw new Error('Sign in first.');
    const r = await fetch('/api/v1/' + path, {
      method,
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        'X-Vendor-Id': client.vendorId,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
    if (!r.ok) throw new Error('Unavailable or permission denied.');
    return r.json();
  }
  async function run(path: string, method: string, body?: unknown) {
    setBusy(true);
    try {
      const r = await request(path, method, body);
      if (method === 'GET') setReport(JSON.stringify(r.data, null, 2));
      setStatus('Saved.');
    } catch {
      setStatus('Unavailable or permission denied.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="m-4 rounded-xl border p-4">
      <summary>Friend testing & safety</summary>
      <p className="my-3 text-sm">
        Feedback contains only a category, never customer text. Safety controls require
        owner/manager permissions.
      </p>
      <div className="flex flex-wrap gap-3">
        {['helpful', 'wrong_reply', 'missing_fact', 'bug', 'confusing', 'other'].map((category) => (
          <button
            disabled={busy}
            className="rounded border p-2"
            key={category}
            onClick={() => void run('feedback', 'POST', { category })}
          >
            Feedback: {category.replaceAll('_', ' ')}
          </button>
        ))}
      </div>
      <div className="my-3 flex flex-wrap gap-3">
        <button
          disabled={busy}
          className="rounded border p-2"
          onClick={() => void run('operations/vendor', 'GET')}
        >
          View safety report
        </button>
        <button
          disabled={busy}
          className="rounded border p-2"
          onClick={() => void run('operations/vendor/ai-pause', 'PATCH', { paused: true })}
        >
          Pause vendor AI
        </button>
        <button
          disabled={busy}
          className="rounded border p-2"
          onClick={() => {
            if (
              window.confirm(
                'Resume AI? Old paused inbound messages will not be replayed, but queued sends will be rechecked.',
              )
            )
              void run('operations/vendor/ai-pause', 'PATCH', { paused: false });
          }}
        >
          Resume vendor AI
        </button>
      </div>
      <p role="status">{status}</p>
      {report && <pre className="max-h-96 overflow-auto whitespace-pre-wrap text-xs">{report}</pre>}
    </details>
  );
}
