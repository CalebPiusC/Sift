'use client';
import { useCallback, useState, useEffect } from 'react';
import type { ChannelAttempt, HelperLink } from '../../lib/data';
import { channelLabels } from '../../lib/data/inbox-logic';
import { useDataClient } from '../data/provider';
import { useResource } from '../../lib/data/use-resource';
import { ResourceView, panel, useAction } from '../data/shared';
import { ChannelIcon } from '../inbox/channel-icon';
import { Button } from '../ui/button';
export function ChannelsSettings() {
  const { client } = useDataClient();
  const rows = useResource(useCallback(() => client.channels.list(), [client]));
  const action = useAction();
  const [attempt, setAttempt] = useState<ChannelAttempt | null>(null),
    [helper, setHelper] = useState(false),
    [success, setSuccess] = useState('');
  if (helper) return <HelperScreen onBack={() => setHelper(false)} />;
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Your channels</h2>
      <p className="text-sm leading-6 text-slate-500">
        Customer replies go from your own connected accounts. Selvora’s WhatsApp helper is separate
        and only helps you make quick updates.
      </p>
      <Button
        variant="outline"
        disabled={action.busy}
        onClick={() =>
          void action
            .run(async () => {
              const existing = await client.channels.helper();
              return existing.ok && existing.data
                ? existing
                : existing.ok
                  ? client.channels.newHelperCode()
                  : existing;
            })
            .then((r) => {
              if (r.ok) setHelper(true);
            })
        }
      >
        Link WhatsApp helper
      </Button>
      {success && (
        <p role="status" className="text-sm text-success">
          {success}
        </p>
      )}
      {attempt && (
        <section aria-label="Connection flow" className={`${panel} border-indigo-300`}>
          <h3 className="font-semibold">
            {channelLabels[attempt.channel]} ·{' '}
            {client.mode === 'mock' ? 'simulated connection' : 'connection'}
          </h3>
          {attempt.channel === 'tiktok' ? (
            <>
              <p className="my-3 text-sm leading-6">
                TikTok availability is being confirmed. We cannot promise access or connect an
                account yet.
              </p>
              <Button variant="outline" onClick={() => setAttempt(null)}>
                Got it
              </Button>
            </>
          ) : (
            <>
              <ol className="my-4 list-inside list-decimal space-y-3 text-sm">
                <li>Choose your own business account.</li>
                <li>Review permissions for customer messages.</li>
                <li>Confirm that this is the account you want to use.</li>
              </ol>
              <p className="my-3 text-xs leading-6 text-slate-500">
                {client.mode === 'mock'
                  ? 'Sample only: no provider login, permissions or real account access. Never enter a password here.'
                  : 'Complete the provider authorisation flow. Never give your password to Selvora.'}
              </p>
              <div className="flex flex-wrap gap-2">
                {attempt.authorizationUrl?.startsWith('https://accounts.google.com/') && (
                  <a
                    className="inline-flex min-h-12 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-white"
                    href={attempt.authorizationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Continue with Google
                  </a>
                )}
                <Button
                  disabled={action.busy}
                  onClick={() =>
                    void action
                      .run(() => client.channels.complete({ attemptId: attempt.id }))
                      .then((r) => {
                        if (r.ok) {
                          setSuccess(
                            `${channelLabels[r.data.channel]} ${client.mode === 'mock' ? 'sample ' : ''}connection complete.`,
                          );
                          setAttempt(null);
                        }
                      })
                  }
                >
                  {client.mode === 'mock' ? 'Simulate authorisation' : 'Check connection'}
                </Button>
                <Button variant="outline" disabled={action.busy} onClick={() => setAttempt(null)}>
                  Cancel connection
                </Button>
              </div>
            </>
          )}
        </section>
      )}
      {client.mode === 'api' && (
        <Button
          disabled={action.busy}
          onClick={() =>
            void action
              .run(() => client.channels.begin({ channel: 'email' }))
              .then((r) => {
                if (r.ok) setAttempt(r.data);
              })
          }
        >
          Connect Gmail
        </Button>
      )}
      <ResourceView resource={rows}>
        {(channels) => (
          <div className="grid gap-4 md:grid-cols-2">
            {channels.map((c) => (
              <article
                key={c.id}
                className={panel}
                aria-label={`${channelLabels[c.channel]} channel`}
              >
                <div className="flex items-center gap-3">
                  <ChannelIcon channel={c.channel} />
                  <h3 className="font-semibold">{channelLabels[c.channel]}</h3>
                </div>
                <p className="my-3 text-xs text-slate-500">
                  Vendor’s own account · {c.displayName}
                </p>
                <p
                  className={`my-3 text-sm font-semibold ${c.status === 'connected' ? 'text-success' : 'text-warning'}`}
                >
                  {c.status === 'connected'
                    ? `${client.mode === 'mock' ? 'Sample ' : ''}Connected`
                    : c.status === 'expired'
                      ? 'Connection expired'
                      : 'Not connected'}
                </p>
                {c.channel === 'tiktok' && (
                  <p className="mb-3 text-xs leading-6 text-slate-500">
                    Availability is being confirmed. TikTok is not currently connected.
                  </p>
                )}
                <Button
                  variant={c.status === 'connected' ? 'outline' : 'default'}
                  disabled={action.busy}
                  onClick={() =>
                    void action
                      .run(() => client.channels.begin({ channel: c.channel }))
                      .then((r) => {
                        if (r.ok) {
                          setAttempt(r.data);
                          setSuccess('');
                        }
                      })
                  }
                >
                  {c.status === 'disconnected' ? 'Connect' : 'Reconnect'} {channelLabels[c.channel]}
                </Button>
              </article>
            ))}
          </div>
        )}
      </ResourceView>
      {action.error && (
        <p role="alert" className="text-xs text-danger">
          {action.error.message}
        </p>
      )}
    </section>
  );
}
function HelperScreen({ onBack }: { onBack: () => void }) {
  const { client } = useDataClient();
  const link = useResource(useCallback(() => client.channels.helper(), [client]));
  const action = useAction();
  return (
    <section className="space-y-4">
      <Button variant="outline" onClick={onBack}>
        Back to channels
      </Button>
      <h2 className="text-xl font-semibold">WhatsApp quick-update helper</h2>
      <p className="text-sm leading-6 text-slate-500">
        Selvora’s number is only a helper for quick updates, like stock changes. It does not replace
        your business number. Customer replies still come from your own account.
      </p>
      <ResourceView resource={link}>
        {(h) => (h ? <HelperCode key={h.id} link={h} /> : <p className={panel}>No code yet.</p>)}
      </ResourceView>
      <Button
        variant="outline"
        disabled={action.busy}
        onClick={() => void action.run(() => client.channels.newHelperCode())}
      >
        New code
      </Button>
      {action.error && (
        <p role="alert" className="text-xs text-danger">
          {action.error.message}
        </p>
      )}
    </section>
  );
}
function HelperCode({ link: h }: { link: HelperLink }) {
  const { client } = useDataClient();
  const action = useAction();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const seconds = Math.max(0, Math.ceil((Date.parse(h.expiresAt) - now) / 1000));
  return (
    <div className={panel}>
      {h.status === 'linked' ? (
        <>
          <h3 className="text-lg font-semibold text-success">Helper linked successfully</h3>
          <p className="mt-3 text-sm leading-6">
            {client.mode === 'mock'
              ? 'Simulated link saved for this session. No WhatsApp message was sent.'
              : 'Your helper association is ready.'}{' '}
            Your customer channel connection has not been changed.
          </p>
        </>
      ) : (
        <>
          <p className="text-xs text-slate-500">Your 4-digit link code</p>
          <p
            aria-label="WhatsApp link code"
            className="my-4 font-mono text-4xl font-semibold tracking-[.3em] text-primary dark:text-indigo-300"
          >
            {h.code}
          </p>
          <p role="timer" aria-live="off" className="text-sm">
            {seconds
              ? `Expires in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
              : 'Code expired. Request a new code.'}
          </p>
          <ol className="my-4 list-inside list-decimal space-y-3 text-sm leading-6">
            <li>Open WhatsApp using your vendor account.</li>
            <li>
              Send this code to Selvora’s WhatsApp helper number
              {h.helperNumber ? `: ${h.helperNumber}` : '.'}
            </li>
            <li>Return here to check the link.</li>
          </ol>
          {!h.helperNumber && (
            <p className="mb-4 rounded-xl bg-amber-50 p-3 text-xs leading-6 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              No live helper number is configured in sample mode. Do not send this code anywhere.
              Use the simulation below.
            </p>
          )}
          <Button
            disabled={!seconds || action.busy}
            onClick={() =>
              void action.run(() =>
                client.mode === 'mock'
                  ? client.channels.confirmHelper({ id: h.id })
                  : client.channels.helper(),
              )
            }
          >
            {client.mode === 'mock' ? 'Simulate sent code' : 'Check link status'}
          </Button>
        </>
      )}
      {action.error && (
        <p role="alert" className="mt-3 text-xs text-danger">
          {action.error.message}
        </p>
      )}
    </div>
  );
}
