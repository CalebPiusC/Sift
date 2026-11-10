'use client';
import type { Dispatch, SetStateAction } from 'react';
export type NotificationPreferences = { ready: boolean; needs: boolean; read: Set<string> };
import type { Approval, Conversation } from '../../lib/data';
import { panel } from '../data/shared';
import { Button } from '../ui/button';
export function Notifications({
  conversations,
  approvals,
  onOpen,
  preferences,
  setPreferences,
}: {
  preferences: NotificationPreferences;
  setPreferences: Dispatch<SetStateAction<NotificationPreferences>>;
  conversations: Conversation[];
  approvals: Approval[];
  onOpen: (id: string) => void;
}) {
  const { ready, needs, read } = preferences;
  const setRead = (read: Set<string>) => setPreferences((p) => ({ ...p, read }));
  const setReady = (ready: boolean) => setPreferences((p) => ({ ...p, ready }));
  const setNeeds = (needs: boolean) => setPreferences((p) => ({ ...p, needs }));
  const entries = [
    ...(needs
      ? approvals.map((a) => ({
          id: a.id,
          conversationId: a.conversationId,
          title: 'Needs you',
          body: a.customerMessage,
          at: a.createdAt,
        }))
      : []),
    ...(ready
      ? conversations
          .filter((c) => c.stage === 'ready_to_pay')
          .map((c) => ({
            id: `ready-${c.id}`,
            conversationId: c.id,
            title: 'Ready to pay',
            body: c.customerName,
            at: c.updatedAt,
          }))
      : []),
  ].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <section className={panel} aria-label="Notification centre">
      <h2 className="text-lg font-semibold">Notification centre</h2>
      <p className="my-2 text-xs leading-6 text-slate-500">
        Only ready-to-pay leads and chats needing you, by default. Preferences and read state are
        for this open inbox. No browser push notifications.
      </p>
      <fieldset className="my-4 flex flex-wrap gap-4">
        <legend className="mb-2 text-xs font-semibold">Notify me about</legend>
        <label className="flex min-h-12 items-center gap-2 text-xs">
          <input
            className="!w-5"
            type="checkbox"
            checked={ready}
            onChange={(e) => setReady(e.target.checked)}
          />
          Ready to pay
        </label>
        <label className="flex min-h-12 items-center gap-2 text-xs">
          <input
            className="!w-5"
            type="checkbox"
            checked={needs}
            onChange={(e) => setNeeds(e.target.checked)}
          />
          Needs you
        </label>
      </fieldset>
      <Button variant="outline" onClick={() => setRead(new Set(entries.map((e) => e.id)))}>
        Mark all read
      </Button>
      <ul className="mt-4 space-y-2">
        {entries.map((e) => (
          <li key={e.id}>
            <button
              className={`min-h-16 w-full rounded-xl border p-4 text-left ${read.has(e.id) ? 'border-slate-200 dark:border-slate-700' : 'border-indigo-200 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950'}`}
              onClick={() => {
                setRead(new Set([...read, e.id]));
                onOpen(e.conversationId);
              }}
            >
              <span className="flex justify-between gap-2 text-xs font-semibold">
                {e.title}
                {!read.has(e.id) && (
                  <span className="text-primary dark:text-indigo-300">Unread</span>
                )}
              </span>
              <p className="my-2 break-words text-sm">{e.body}</p>
              <time className="text-[10px] text-slate-500" dateTime={e.at}>
                {new Date(e.at).toLocaleString('en-NG', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
            </button>
          </li>
        ))}
      </ul>
      {!entries.length && (
        <p className="py-8 text-sm text-slate-500">
          You’re all caught up. No matching notifications.
        </p>
      )}
    </section>
  );
}
