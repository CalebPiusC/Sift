'use client';
import { useEffect, useState } from 'react';
import { authConfigured, supabase } from '../../../lib/supabase';
export default function AcceptInvitation() {
  const [token, setToken] = useState('');
  const [status, setStatus] = useState(
    'Sign in with the verified invited email in another tab, then accept here.',
  );
  useEffect(() => {
    setToken(new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '');
    window.history.replaceState(null, '', '/invitations/accept');
  }, []);
  async function accept() {
    if (!authConfigured() || !token) {
      setStatus('Invitation or authentication configuration is missing.');
      return;
    }
    try {
      const { data } = await supabase().auth.getSession();
      if (!data.session) {
        setStatus('Please sign in with the invited email in another tab first.');
        return;
      }
      const response = await fetch('/api/v1/team/invitations/accept', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
        cache: 'no-store',
      });
      setStatus(
        response.ok
          ? 'Invitation accepted. Return to the workspace and reload.'
          : 'Could not accept. Check the verified email, expiry and invitation status.',
      );
      if (response.ok) setToken('');
    } catch {
      setStatus('Network unavailable. Try again.');
    }
  }
  return (
    <main className="mx-auto max-w-lg space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Join your Selvora team</h1>
      <p role="status">{status}</p>
      <button
        className="rounded-xl bg-indigo-700 p-4 text-white"
        disabled={!token}
        onClick={() => void accept()}
      >
        Accept invitation
      </button>
      <p>
        <a href="/" target="_blank" rel="noreferrer">
          Open sign in in a new tab
        </a>
      </p>
    </main>
  );
}
