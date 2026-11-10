'use client';
import { useCallback, useEffect, useState } from 'react';
import { Mic, Send, Sparkles, FlaskConical } from 'lucide-react';
import { useDataClient } from './provider';
import { useResource } from '../../lib/data/use-resource';
import { ResourceView, panel, useAction } from './shared';
import { Button } from '../ui/button';
import type { Channel } from '../../lib/data';
export function InboxPanel() {
  const { client } = useDataClient();
  const [channel, setChannel] = useState<Channel | ''>('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState('');
  const conversations = useResource(
    useCallback(
      () => client.conversations.list({ channel: channel || undefined, search }),
      [client, channel, search],
    ),
  );
  const approvals = useResource(
    useCallback(() => client.approvals.list({ status: 'pending' }), [client]),
  );
  const firstId = conversations.status === 'success' ? (conversations.data.items[0]?.id ?? '') : '';
  useEffect(() => {
    if (!selected && firstId) setSelected(firstId);
  }, [selected, firstId]);
  const activeId =
    selected || (conversations.status === 'success' ? (conversations.data.items[0]?.id ?? '') : '');
  const action = useAction();
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Your inbox</h2>
          <p className="mt-1 text-xs text-slate-500">Every channel. One conversation at a time.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(['', 'whatsapp', 'instagram', 'facebook', 'tiktok', 'email'] as const).map((c) => (
            <button
              key={c}
              onClick={() => setChannel(c)}
              aria-pressed={channel === c}
              className={`min-h-11 rounded-full px-3 text-xs capitalize ${channel === c ? 'bg-primary text-white' : 'border border-slate-200 dark:border-slate-700'}`}
            >
              {c || 'All channels'}
            </button>
          ))}
        </div>
      </div>
      {action.error && (
        <p role="alert" className="text-xs text-danger">
          {action.error.message}
        </p>
      )}
      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        <section className={panel}>
          <label className="text-xs font-medium">
            Find a conversation
            <input
              className="my-3"
              placeholder="Search customers or messages"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <ResourceView resource={conversations}>
            {(page) => (
              <>
                <p className="mb-3 text-xs text-slate-400">{page.total} conversations</p>
                <div className="max-h-[520px] space-y-1 overflow-y-auto">
                  {page.items.length === 0 && (
                    <p className="py-8 text-sm text-slate-500">No conversations match.</p>
                  )}
                  {page.items.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setSelected(c.id);
                        void action.run(() => client.conversations.markRead(c.id));
                      }}
                      aria-pressed={activeId === c.id}
                      className={`w-full rounded-xl p-3 text-left ${activeId === c.id ? 'bg-indigo-50 dark:bg-indigo-950' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    >
                      <span className="flex justify-between gap-2 text-sm font-semibold">
                        {c.customerName}
                        {c.unreadCount > 0 && (
                          <span className="rounded-full bg-primary px-1.5 text-[10px] text-white">
                            {c.unreadCount}
                          </span>
                        )}
                      </span>
                      <span className="mt-1 block text-[10px] capitalize text-primary dark:text-indigo-300">
                        {c.channel} · {c.status}
                      </span>
                      <span className="mt-1 block truncate text-xs text-slate-500">
                        {c.lastMessage}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </ResourceView>
        </section>
        {activeId ? (
          <MessageThread conversationId={activeId} />
        ) : (
          <p className={panel}>Select a conversation to read its messages.</p>
        )}
      </div>
      <section className={panel}>
        <h2 className="mb-4 text-base font-semibold">Needs your say</h2>
        <ResourceView resource={approvals}>
          {(page) =>
            page.items.length === 0 ? (
              <p className="text-sm text-slate-500">You’re all caught up.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {page.items.map((a) => (
                  <div key={a.id} className="bubble-pending rounded-xl p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-warning">
                      {a.reason.replaceAll('_', ' ')}
                    </p>
                    <p className="mt-3 text-sm">“{a.customerMessage}”</p>
                    <ul className="my-3 text-xs text-slate-500">
                      {a.facts.map((f) => (
                        <li key={f.label}>
                          {f.label}: {f.value}
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs leading-6 text-slate-500">Proposed: {a.proposedReply}</p>
                    <p className="mt-3 text-[10px] text-slate-400">
                      Waiting for vendor approval · {Math.round(a.confidence * 100)}% confidence
                    </p>
                  </div>
                ))}
              </div>
            )
          }
        </ResourceView>
      </section>
    </div>
  );
}
function MessageThread({ conversationId }: { conversationId: string }) {
  const { client } = useDataClient();
  const [text, setText] = useState('');
  const action = useAction();
  const messages = useResource(
    useCallback(() => client.messages.list({ conversationId }), [client, conversationId]),
  );
  const conversation = useResource(
    useCallback(() => client.conversations.get(conversationId), [client, conversationId]),
  );
  return (
    <section className={`${panel} flex min-h-[560px] flex-col`}>
      <ResourceView resource={conversation}>
        {(c) => (
          <header className="mb-5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-semibold">{c.customerName}</h3>
              <p className="mt-1 text-xs capitalize text-slate-400">
                {c.channel} ·{' '}
                {c.humanModeUntil && Date.parse(c.humanModeUntil) > Date.now()
                  ? 'Human mode'
                  : 'AI assistant'}
              </p>
            </div>
            {client.developer && (
              <Button
                variant="outline"
                disabled={action.busy}
                className="px-3 text-xs"
                onClick={() =>
                  void action.run(() => client.developer!.simulateIncoming({ conversationId }))
                }
              >
                <FlaskConical size={15} />
                Simulate incoming message
              </Button>
            )}
          </header>
        )}
      </ResourceView>
      <div
        aria-live="polite"
        aria-label="Chat messages"
        className="max-h-[420px] flex-1 space-y-4 overflow-y-auto pb-5"
      >
        <ResourceView resource={messages}>
          {(page) => (
            <>
              {page.items.length === 0 && (
                <p className="text-sm text-slate-400">No messages yet.</p>
              )}
              {page.items.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.sender === 'customer' ? 'justify-start' : 'justify-end'}`}
                >
                  <div
                    className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-6 ${m.sender === 'customer' ? 'bubble-customer' : m.sender === 'ai' ? 'bubble-ai' : 'bubble-vendor border border-slate-200 dark:border-slate-700'}`}
                  >
                    {m.sender === 'ai' && (
                      <span className="mb-1 flex items-center gap-1 text-[10px] font-bold">
                        <Sparkles size={10} />
                        AI
                      </span>
                    )}
                    {m.kind === 'voice' && m.voice ? (
                      <>
                        <p className="flex items-center gap-2 font-medium">
                          <Mic size={16} />
                          Voice note · {m.voice.durationSeconds}s
                        </p>
                        <p className="mt-2 text-xs">Sample transcript: {m.voice.transcript}</p>
                        <p className="mt-1 text-[10px] text-slate-400">
                          Audio unavailable in sample data
                        </p>
                      </>
                    ) : (
                      m.text
                    )}
                    <p className="mt-1 text-right text-[10px] opacity-50">
                      {new Date(m.createdAt).toLocaleTimeString('en-NG', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </>
          )}
        </ResourceView>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void action
            .run(() => client.messages.send({ conversationId, text }))
            .then((r) => {
              if (r.ok) setText('');
            });
        }}
        className="flex items-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800"
      >
        <label className="flex-1 text-[10px] text-slate-400">
          Reply as vendor
          <input
            placeholder="Type your reply…"
            className="mt-1"
            value={text}
            maxLength={4000}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <Button aria-label="Send message" disabled={!text.trim() || action.busy}>
          <Send size={17} />
        </Button>
      </form>
      {action.error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {action.error.message}
        </p>
      )}
    </section>
  );
}
