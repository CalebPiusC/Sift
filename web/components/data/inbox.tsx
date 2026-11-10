'use client';
import { useCallback, useState } from 'react';
import { useDataClient } from './provider';
import { useResource } from '../../lib/data/use-resource';
import { ResourceView, panel, useAction } from './shared';
import type { Channel, LeadStage } from '../../lib/data';
import { humanMode, stages, channelLabels } from '../../lib/data/inbox-logic';
import { ChannelIcon } from '../inbox/channel-icon';
import { ApprovalCard } from '../inbox/approval-card';
import { MessageThread } from '../inbox/thread';
import type { NotificationPreferences } from '../inbox/notifications';
import { Notifications } from '../inbox/notifications';
import { messageTime } from '../inbox/message-bubble';
export function InboxPanel() {
  const { client } = useDataClient();
  const [channel, setChannel] = useState<Channel | ''>('');
  const [stage, setStage] = useState<LeadStage | ''>('');
  const [needsMe, setNeedsMe] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<'Inbox' | 'Needs you' | 'Notifications'>('Inbox');
  const action = useAction();
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>({
    ready: true,
    needs: true,
    read: new Set(),
  });
  const conversations = useResource(
    useCallback(
      () =>
        client.conversations.list({
          channel: channel || undefined,
          stage: stage || undefined,
          needsMe,
          search,
          limit: 100,
        }),
      [client, channel, stage, needsMe, search],
    ),
  );
  const all = useResource(useCallback(() => client.conversations.list({ limit: 100 }), [client]));
  const approvals = useResource(
    useCallback(() => client.approvals.list({ status: 'pending', limit: 100 }), [client]),
  );
  function open(id: string) {
    setSelected(id);
    setTab('Inbox');
    void action.run(() => client.conversations.markRead(id));
  }
  const pending = approvals.status === 'success' ? approvals.data.items : [];
  return (
    <div className="min-w-0 space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold">Your inbox</h2>
          <p className="mt-1 text-xs text-slate-500">
            Every channel. Your voice. Nothing important missed.
          </p>
        </div>
        <span className="rounded-full bg-emerald-50 px-3 py-2 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          {client.mode === 'mock' ? '● Sample live updates' : 'API data mode'}
        </span>
      </header>
      <div role="tablist" aria-label="Inbox views" className="flex gap-2 overflow-x-auto">
        {(['Inbox', 'Needs you', 'Notifications'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            tabIndex={tab === t ? 0 : -1}
            onKeyDown={(e) => {
              const tabs = ['Inbox', 'Needs you', 'Notifications'] as const;
              let i = tabs.indexOf(t);
              if (e.key === 'ArrowRight') i = (i + 1) % 3;
              else if (e.key === 'ArrowLeft') i = (i + 2) % 3;
              else if (e.key === 'Home') i = 0;
              else if (e.key === 'End') i = 2;
              else return;
              e.preventDefault();
              setTab(tabs[i]);
              e.currentTarget.parentElement
                ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                [i]?.focus();
            }}
            aria-selected={tab === t}
            aria-controls="inbox-view"
            onClick={() => setTab(t)}
            className={`min-h-12 shrink-0 rounded-full px-4 text-xs font-semibold ${tab === t ? 'bg-primary text-white' : 'border border-slate-200 dark:border-slate-700'}`}
          >
            {t}
            {t === 'Needs you' && pending.length > 0 ? ` (${pending.length})` : ''}
          </button>
        ))}
      </div>
      {action.error && (
        <p role="alert" className="text-xs text-danger">
          {action.error.message}
        </p>
      )}
      <div id="inbox-view" role="tabpanel" aria-label={tab}>
        {tab === 'Needs you' ? (
          <ResourceView resource={approvals}>
            {(page) => (
              <section className={panel}>
                <h2 className="mb-2 text-lg font-semibold">Your decisions, not every reply</h2>
                <p className="mb-5 text-xs leading-6 text-slate-500">
                  Routine verified replies stay automatic. These requests need your judgement.
                </p>
                {!page.items.length && (
                  <p className="py-8 text-sm text-slate-500">You’re all caught up.</p>
                )}
                <div className="grid gap-4 xl:grid-cols-2">
                  {page.items.map((a) => (
                    <ApprovalCard key={a.id} approval={a} onOpen={() => open(a.conversationId)} />
                  ))}
                </div>
              </section>
            )}
          </ResourceView>
        ) : tab === 'Notifications' ? (
          <ResourceView resource={all}>
            {(p) => (
              <ResourceView resource={approvals}>
                {(a) => (
                  <Notifications
                    preferences={notificationPreferences}
                    setPreferences={setNotificationPreferences}
                    conversations={p.items}
                    approvals={a.items}
                    onOpen={open}
                  />
                )}
              </ResourceView>
            )}
          </ResourceView>
        ) : (
          <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(260px,330px)_minmax(0,1fr)]">
            <section
              className={`${panel} min-w-0 ${selected ? 'hidden lg:block' : ''}`}
              aria-label="Conversation list"
            >
              <label className="block text-xs font-medium">
                Find a conversation
                <input
                  className="my-3"
                  placeholder="Search customers or messages"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="min-w-0 text-xs">
                  Channel
                  <select
                    className="mt-1 w-full"
                    value={channel}
                    onChange={(e) => setChannel(e.target.value as typeof channel)}
                  >
                    <option value="">All channels</option>
                    {(Object.keys(channelLabels) as Channel[]).map((c) => (
                      <option key={c} value={c}>
                        {channelLabels[c]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="min-w-0 text-xs">
                  Lead stage
                  <select
                    className="mt-1 w-full"
                    value={stage}
                    onChange={(e) => setStage(e.target.value as typeof stage)}
                  >
                    <option value="">All stages</option>
                    {(Object.keys(stages) as LeadStage[]).map((s) => (
                      <option key={s} value={s}>
                        {stages[s]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="my-3 flex min-h-12 items-center gap-2 text-xs font-semibold">
                <input
                  type="checkbox"
                  className="!w-5"
                  checked={needsMe}
                  onChange={(e) => setNeedsMe(e.target.checked)}
                />
                Needs me only
              </label>
              <ResourceView resource={conversations}>
                {(page) => (
                  <>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="text-xs text-slate-500">{page.total} conversations</p>
                      {(search || channel || stage || needsMe) && (
                        <button
                          className="min-h-11 text-xs text-primary dark:text-indigo-300"
                          onClick={() => {
                            setSearch('');
                            setChannel('');
                            setStage('');
                            setNeedsMe(false);
                          }}
                        >
                          Reset filters
                        </button>
                      )}
                    </div>
                    <div className="max-h-[68dvh] space-y-2 overflow-y-auto">
                      {!page.items.length && (
                        <p className="py-8 text-sm text-slate-500">
                          No conversations match. Try a different filter.
                        </p>
                      )}
                      {page.items.map((c) => {
                        const needs = pending.some((a) => a.conversationId === c.id);
                        return (
                          <button
                            data-testid="conversation-row"
                            aria-label={`Open chat with ${c.customerName}`}
                            key={c.id}
                            onClick={() => open(c.id)}
                            aria-pressed={selected === c.id}
                            className={`flex min-h-24 w-full min-w-0 gap-3 rounded-xl border p-3 text-left ${selected === c.id ? 'border-indigo-200 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950' : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                          >
                            <ChannelIcon channel={c.channel} />
                            <span className="min-w-0 flex-1">
                              <span className="flex items-start justify-between gap-2">
                                <span className="truncate text-sm font-semibold">
                                  {c.customerName}
                                </span>
                                <time
                                  dateTime={c.updatedAt}
                                  className="shrink-0 text-[10px] text-slate-500"
                                >
                                  {new Date(c.updatedAt).toDateString() ===
                                  new Date().toDateString()
                                    ? messageTime(c.updatedAt)
                                    : new Date(c.updatedAt).toLocaleDateString('en-NG', {
                                        day: 'numeric',
                                        month: 'short',
                                      })}
                                </time>
                              </span>
                              <span className="my-1 block truncate text-xs text-slate-500">
                                {c.lastMessage}
                              </span>
                              <span className="flex flex-wrap items-center gap-1 text-[9px] font-semibold">
                                <span className="rounded-full bg-slate-100 px-2 py-1 dark:bg-slate-800">
                                  {stages[c.stage]}
                                </span>
                                <span
                                  className={`rounded-full px-2 py-1 ${humanMode(c) ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200' : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'}`}
                                >
                                  {humanMode(c) ? 'Human · AI paused' : 'AI active'}
                                </span>
                                {needs && (
                                  <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                                    Needs you
                                  </span>
                                )}
                                {c.unreadCount > 0 && (
                                  <span
                                    aria-label={`${c.unreadCount} unread`}
                                    className="rounded-full bg-primary px-2 py-1 text-white"
                                  >
                                    {c.unreadCount}
                                  </span>
                                )}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </ResourceView>
            </section>
            {selected ? (
              <MessageThread
                key={selected}
                conversationId={selected}
                draft={drafts[selected] ?? ''}
                onDraftChange={(text) => setDrafts((d) => ({ ...d, [selected]: text }))}
                onBack={() => setSelected('')}
              />
            ) : (
              <section className={`${panel} hidden place-content-center text-center lg:grid`}>
                <h3 className="font-semibold">A little clarity for every conversation.</h3>
                <p className="mt-2 text-sm text-slate-500">
                  Choose a chat to see messages, decisions and customer details.
                </p>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
