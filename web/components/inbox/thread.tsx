'use client';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { FlaskConical, Send, ArrowLeft } from 'lucide-react';
import type { MockControls } from '../../lib/data';
import { humanMode, channelLabels, channelLink } from '../../lib/data/inbox-logic';
import { useResource } from '../../lib/data/use-resource';
import { useDataClient } from '../data/provider';
import { ResourceView, panel, useAction } from '../data/shared';
import { Button } from '../ui/button';
import { ApprovalCard } from './approval-card';
import { MessageBubble } from './message-bubble';
import { CustomerDrawer } from './customer-drawer';
export function MessageThread({
  conversationId,
  onBack,
  draft,
  onDraftChange,
}: {
  conversationId: string;
  draft: string;
  onDraftChange: (text: string) => void;
  onBack: () => void;
}) {
  const { client } = useDataClient();
  const text = draft;
  const setText = onDraftChange;
  const [drawer, setDrawer] = useState(false);
  const [scenario, setScenario] =
    useState<NonNullable<Parameters<MockControls['simulateIncoming']>[0]['scenario']>>('greeting');
  const action = useAction();
  const end = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const [newMessages, setNewMessages] = useState(false);
  const sendIntent = useRef<{ text: string; key: string } | null>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const messages = useResource(
    useCallback(
      () => client.messages.list({ conversationId, limit: 100, latest: true }),
      [client, conversationId],
    ),
  );
  const conversation = useResource(
    useCallback(() => client.conversations.get(conversationId), [client, conversationId]),
  );
  const approvals = useResource(
    useCallback(() => client.approvals.list({ status: 'pending', limit: 100 }), [client]),
  );
  const close = useCallback(() => setDrawer(false), []);
  const lastId = messages.status === 'success' ? messages.data.items.at(-1)?.id : '';
  useEffect(() => {
    if (!lastId) return;
    if (nearBottom.current) {
      end.current?.scrollIntoView?.({ block: 'nearest' });
      setNewMessages(false);
    } else setNewMessages(true);
    void client.conversations.markRead(conversationId);
  }, [client, conversationId, lastId]);
  // No markRead-on-revision loop: only new message IDs trigger it.
  const date = (s: string) =>
    new Date(s).toLocaleDateString('en-NG', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  return (
    <section
      aria-label="Conversation"
      className={`${panel} fixed inset-x-0 bottom-[72px] ${client.mode === 'mock' ? 'top-[52px]' : 'top-0'} z-30 flex min-w-0 flex-col rounded-none !p-3 lg:static lg:z-auto lg:h-[calc(100dvh-220px)] lg:min-h-[640px] lg:rounded-2xl lg:!p-5`}
    >
      <Button variant="outline" onClick={onBack} className="mb-3 lg:hidden">
        <ArrowLeft size={16} aria-hidden="true" />
        Back to inbox
      </Button>
      <ResourceView resource={conversation}>
        {(c) => {
          const human = humanMode(c),
            link = channelLink(c);
          return (
            <>
              <header className="border-b border-slate-200 pb-3 dark:border-slate-700">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">{c.customerName}</h3>
                    {c.assignedName && (
                      <p className="text-xs text-slate-500">Assigned to {c.assignedName}</p>
                    )}
                    <p className="mt-1 text-xs text-slate-500">
                      {channelLabels[c.channel]} ·{' '}
                      <strong
                        className={
                          human
                            ? 'text-amber-700 dark:text-amber-300'
                            : 'text-primary dark:text-indigo-300'
                        }
                      >
                        {human ? 'Human mode · AI paused' : 'AI assistant active'}
                      </strong>
                    </p>
                  </div>
                  <Button variant="outline" onClick={() => setDrawer(true)}>
                    Customer details
                  </Button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    disabled={action.busy}
                    variant={human ? 'outline' : 'default'}
                    onClick={() =>
                      void action.run(() =>
                        client.conversations.setHumanMode({
                          id: c.id,
                          until: human ? null : new Date(Date.now() + 30 * 60000).toISOString(),
                        }),
                      )
                    }
                  >
                    {human ? 'Hand Back' : 'Take Over'}
                  </Button>
                  {human && (
                    <a
                      className="inline-flex min-h-12 items-center rounded-xl border border-slate-300 px-4 text-xs font-semibold dark:border-slate-600"
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open in {channelLabels[c.channel]}
                    </a>
                  )}
                </div>
                {human && (
                  <div
                    role="status"
                    className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs leading-6 text-amber-950 dark:bg-amber-950 dark:text-amber-100"
                  >
                    <strong>You’re in charge. AI is paused for this chat.</strong>
                    <p>
                      Auto hand-back at{' '}
                      {new Date(c.humanModeUntil!).toLocaleTimeString('en-NG', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      . You can hand back sooner.
                    </p>
                    {!link.exact && (
                      <p>
                        {client.mode === 'mock'
                          ? 'No customer thread link in sample data.'
                          : 'No customer thread link is available.'}{' '}
                        The button opens the channel inbox
                        {c.channel === 'email' ? ' / email app' : ''}, not this exact chat.
                      </p>
                    )}
                  </div>
                )}
              </header>
              {drawer && <CustomerDrawer customerId={c.customerId} onClose={close} />}
            </>
          );
        }}
      </ResourceView>
      {client.developer && (
        <div className="my-3 flex flex-wrap items-end gap-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
          <label className="min-w-0 flex-1 text-xs">
            Sample chat scenario
            <select
              className="mt-1 w-full"
              value={scenario}
              onChange={(e) => setScenario(e.target.value as typeof scenario)}
            >
              {(['greeting', 'product', 'ready_to_pay', 'approval', 'voice', 'order'] as const).map(
                (s) => (
                  <option key={s} value={s}>
                    {s.replaceAll('_', ' ')}
                  </option>
                ),
              )}
            </select>
          </label>
          <Button
            variant="outline"
            disabled={action.busy}
            onClick={() =>
              void action.run(() =>
                client.developer!.simulateIncoming({ conversationId, scenario }),
              )
            }
          >
            <FlaskConical size={15} />
            <span className="sr-only sm:not-sr-only">Simulate incoming message</span>
          </Button>
        </div>
      )}
      <div
        ref={scroll}
        onScroll={() => {
          const el = scroll.current;
          if (el) {
            nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
            if (nearBottom.current) setNewMessages(false);
          }
        }}
        aria-label="Chat messages"
        aria-live="polite"
        className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain py-4"
      >
        <ResourceView resource={messages}>
          {(page) => (
            <>
              {page.total > page.items.length && (
                <p className="text-center text-xs text-slate-500">
                  Showing first {page.items.length} messages. Older history pagination is not
                  connected.
                </p>
              )}
              {!page.items.length && (
                <p className="text-sm text-slate-500">No messages yet. Say hello to start.</p>
              )}
              {page.items.map((m, i) => (
                <Fragment key={m.id}>
                  {(i === 0 || date(page.items[i - 1].createdAt) !== date(m.createdAt)) && (
                    <div className="flex items-center gap-3 text-[10px] text-slate-500">
                      <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                      <time dateTime={m.createdAt}>{date(m.createdAt)}</time>
                      <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                    </div>
                  )}
                  <MessageBubble message={m} sample={client.mode === 'mock'} />
                  {m.status === 'failed' && client.messages.retry && (
                    <Button
                      variant="outline"
                      disabled={action.busy}
                      onClick={() => void action.run(() => client.messages.retry!(m.id))}
                    >
                      {m.deliveryErrorCode === 'DELIVERY_UNCERTAIN'
                        ? 'Check send status'
                        : 'Retry reply'}
                    </Button>
                  )}
                </Fragment>
              ))}
            </>
          )}
        </ResourceView>
        <ResourceView resource={approvals}>
          {(page) => (
            <>
              {page.items
                .filter((a) => a.conversationId === conversationId)
                .map((a) => (
                  <ApprovalCard key={a.id} approval={a} />
                ))}
            </>
          )}
        </ResourceView>
        <div ref={end} />
      </div>
      {newMessages && (
        <Button
          variant="outline"
          className="my-2"
          onClick={() => {
            end.current?.scrollIntoView?.({ block: 'nearest' });
            nearBottom.current = true;
            setNewMessages(false);
          }}
        >
          New messages ↓
        </Button>
      )}
      <ResourceView resource={conversation}>
        {(c) => (
          <div className="border-t border-slate-200 pt-3 dark:border-slate-700">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              AI suggested quick replies · tap to edit, not send
            </p>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {c.suggestedReplies.map((reply) => (
                <button
                  key={reply}
                  className="min-h-12 shrink-0 rounded-full border border-indigo-200 px-3 text-xs dark:border-indigo-800"
                  onClick={() => {
                    setText(reply);
                    composer.current?.focus();
                  }}
                >
                  {reply}
                </button>
              ))}
            </div>
          </div>
        )}
      </ResourceView>
      <form
        className="mt-2 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim() || action.busy) return;
          if (!sendIntent.current || sendIntent.current.text !== `${conversationId}:${text}`)
            sendIntent.current = { text: `${conversationId}:${text}`, key: crypto.randomUUID() };
          const idempotencyKey = sendIntent.current.key;
          void action
            .run(() => client.messages.send({ conversationId, text, idempotencyKey }))
            .then((r) => {
              if (r.ok) {
                setText('');
                sendIntent.current = null;
                nearBottom.current = true;
              }
            });
        }}
      >
        <label className="min-w-0 flex-1 text-xs">
          Your reply
          <textarea
            aria-label="Your reply"
            ref={composer}
            rows={2}
            maxLength={4000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type a reply…"
          />
        </label>
        <Button type="submit" aria-label="Send reply" disabled={action.busy || !text.trim()}>
          <Send size={16} />
          <span className="hidden sm:inline">Send</span>
        </Button>
      </form>
      <p className="mt-2 text-[10px] text-slate-500">
        {client.mode === 'mock'
          ? 'Sample send only · no real channel delivery.'
          : 'Replies use your connected account.'}{' '}
        Sending manually does not pause AI; use Take Over.
      </p>
      {action.error && (
        <p role="alert" className="mt-3 text-xs text-danger">
          {action.error.message}
        </p>
      )}
    </section>
  );
}
