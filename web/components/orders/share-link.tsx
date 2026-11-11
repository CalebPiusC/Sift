'use client';
import { useState } from 'react';
import { Button } from '../ui/button';
export function ShareLink({
  url,
  title,
  label = 'Share link',
}: {
  url: string;
  title: string;
  label?: string;
}) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setMessage('Link copied.');
    } catch {
      setMessage('Copy unavailable. Select the link above and copy it manually.');
    }
  }
  async function share() {
    setBusy(true);
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        setMessage('Share sheet opened.');
      } else await copy();
    } catch (e) {
      if (!(e instanceof Error && e.name === 'AbortError')) await copy();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <label className="block text-xs font-medium">
        {label}
        <input
          className="mt-2 text-xs"
          aria-label={label}
          readOnly
          value={url}
          onFocus={(e) => e.target.select()}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy} onClick={() => void copy()}>
          Copy link
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => void share()}>
          Share
        </Button>
      </div>
      {message && (
        <p role="status" className="text-xs text-slate-500">
          {message}
        </p>
      )}
    </div>
  );
}
