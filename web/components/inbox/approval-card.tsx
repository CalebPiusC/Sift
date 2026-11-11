'use client';
import { useEffect, useState } from 'react';
import type { Approval } from '../../lib/data';
import { reasons } from '../../lib/data/inbox-logic';
import { useDataClient } from '../data/provider';
import { useAction } from '../data/shared';
import { Button } from '../ui/button';
export function ApprovalCard({ approval: a, onOpen }: { approval: Approval; onOpen?: () => void }) {
  const { client } = useDataClient();
  const action = useAction();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(a.proposedReply);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.ceil((Date.parse(a.holdingReplyDueAt) - now) / 1000));
  return (
    <article
      aria-label={`Approval ${a.id}`}
      className="bubble-pending min-w-0 rounded-2xl border-2 border-dashed border-amber-400 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Needs you</h3>
        {onOpen && (
          <Button variant="outline" onClick={onOpen}>
            Open conversation
          </Button>
        )}
      </div>
      <p className="mt-3 text-xs font-semibold text-slate-500">Customer’s message</p>
      <blockquote className="mt-1 text-sm leading-6">“{a.customerMessage}”</blockquote>
      <p className="mt-3 text-xs font-semibold text-slate-500">Facts found</p>
      <dl className="my-2 grid grid-cols-2 gap-2 text-xs">
        {a.facts.map((f) => (
          <div key={f.label} className="min-w-0 rounded-lg bg-white/60 p-2 dark:bg-slate-900/60">
            <dt className="text-slate-500">{f.label}</dt>
            <dd className="mt-1 break-words font-semibold">{f.value}</dd>
          </div>
        ))}
      </dl>
      {!a.facts.length && <p className="text-xs">No verified catalogue facts found.</p>}
      <p className="my-3 text-xs leading-6">
        <strong>Why this needs you: </strong>
        {reasons[a.reason]}
      </p>
      <p className="text-xs font-semibold">Proposed reply · not sent</p>
      {editing ? (
        <label className="mt-2 block text-xs">
          Edit proposed reply
          <textarea
            aria-label="Edit proposed reply"
            rows={4}
            maxLength={4000}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
      ) : (
        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{a.proposedReply}</p>
      )}
      <p className="my-3 text-xs text-amber-800 dark:text-amber-300" role="timer" aria-live="off">
        {a.holdingReplySentAt
          ? 'Holding reply sent · your decision is still needed'
          : seconds > 0
            ? `Holding reply in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
            : 'Holding reply due · paused in human mode; otherwise sending shortly'}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={action.busy || (editing && !text.trim())}
          onClick={() =>
            void action.run(() =>
              client.approvals.decide({
                id: a.id,
                action: editing ? 'edit' : 'send',
                ...(editing ? { editedReply: text } : {}),
              }),
            )
          }
        >
          {editing ? 'Send edited reply' : 'Send'}
        </Button>
        <Button variant="outline" disabled={action.busy} onClick={() => setEditing(!editing)}>
          {editing ? 'Cancel edit' : 'Edit'}
        </Button>
        <Button
          variant="outline"
          disabled={action.busy}
          onClick={() =>
            void action.run(() => client.approvals.decide({ id: a.id, action: 'reject' }))
          }
        >
          Reject
        </Button>
      </div>
      {action.error && (
        <p role="alert" className="mt-3 text-xs text-danger">
          {action.error.message}
        </p>
      )}
    </article>
  );
}
