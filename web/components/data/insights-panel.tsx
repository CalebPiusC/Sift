'use client';
import { useCallback, useState } from 'react';
import { useDataClient } from './provider';
import { useResource } from '../../lib/data/use-resource';
import { localDay, validRange } from '../../lib/data/insights-logic';
import { ResourceView, naira, panel } from './shared';
import { ExtrasPanel } from './extras-panel';
export function Bars({
  title,
  summary,
  rows,
  format = (n: number) => String(n),
}: {
  title: string;
  summary: string;
  rows: { label: string; value: number }[];
  format?: (n: number) => string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <section className={panel} aria-label={title}>
      <h3 className="font-semibold">{title}</h3>
      <p className="my-3 text-sm leading-6 text-slate-500">{summary}</p>
      <div
        role="img"
        aria-label={`${title}: ${rows.map((r) => `${r.label} ${format(r.value)}`).join(', ') || 'No data'}`}
        className="space-y-3"
      >
        {rows.length ? (
          rows.map((r) => (
            <div key={r.label}>
              <div className="mb-1 flex min-w-0 justify-between gap-3 text-xs">
                <span className="min-w-0 break-words capitalize">{r.label}</span>
                <span className="shrink-0 font-semibold">{format(r.value)}</span>
              </div>
              <div className="h-2 rounded-full bg-indigo-50 dark:bg-indigo-950">
                <div
                  className="h-2 rounded-full bg-primary"
                  style={{ width: `${(r.value / max) * 100}%` }}
                />
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-500">No activity in this range.</p>
        )}
      </div>
    </section>
  );
}
export function InsightsPanel() {
  const { client } = useDataClient();
  const [tab, setTab] = useState('Overview');
  const today = localDay(new Date().toISOString());
  const [from, setFrom] = useState(localDay(new Date(Date.now() - 29 * 86400000).toISOString())),
    [to, setTo] = useState(today);
  const range = { from, to };
  const valid = validRange(range);
  const r = useResource(useCallback(() => client.insights.get({ from, to }), [client, from, to]));
  return (
    <section className="min-w-0 space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Know what moves your business.</h2>
        <p className="mt-2 text-xs leading-6 text-slate-500">
          Insights & extras · Africa/Lagos time. Sample history, not a forecast.
        </p>
      </div>
      <nav aria-label="Insights and extras" className="flex flex-wrap gap-2">
        {['Overview', 'Follow-ups', 'Spam & scam', 'Restock', 'Customers'].map((t) => (
          <button
            key={t}
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
            className={`min-h-12 rounded-xl border px-4 text-xs ${tab === t ? 'border-primary bg-primary text-white' : 'border-slate-200 dark:border-slate-700'}`}
          >
            {t}
          </button>
        ))}
      </nav>
      {tab !== 'Overview' ? (
        <ExtrasPanel area={tab} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <label className="min-w-0 text-xs">
              From
              <input
                className="mt-2 w-full min-w-0"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="min-w-0 text-xs">
              To
              <input
                className="mt-2 w-full min-w-0"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </div>
          {!valid ? (
            <p role="alert" className="text-sm text-danger">
              Choose valid dates with the start on or before the end.
            </p>
          ) : (
            <ResourceView resource={r}>
              {(d) => {
                const peak = [...d.hours].sort((a, b) => b.value - a.value)[0];
                const total = d.handling.reduce((n, r) => n + r.value, 0);
                return (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        ['Revenue', naira(d.revenueKobo)],
                        ['Orders created', d.orderCount],
                        ['Active leads', d.conversationCount],
                        ['Pending approvals', d.pendingApprovals],
                      ].map(([k, v]) => (
                        <article key={k} className={`${panel} min-w-0`}>
                          <p className="text-xs text-slate-500">{k}</p>
                          <p className="mt-3 break-words text-lg font-semibold">{v}</p>
                        </article>
                      ))}
                    </div>
                    <div className="grid min-w-0 gap-4 md:grid-cols-2">
                      <Bars
                        title="Leads by channel"
                        summary={`${d.conversationCount} leads were active in this range, counted once per conversation by last activity.`}
                        rows={d.byChannel.map((c) => ({
                          label: c.channel,
                          value: c.conversations,
                        }))}
                      />
                      <Bars
                        title="Response time"
                        summary={
                          d.responseSeconds === null
                            ? 'No completed response pairs in this range.'
                            : `Average first response was ${d.responseSeconds} seconds across ${d.responseSamples} customer-to-reply pairs. Unanswered messages are excluded.`
                        }
                        rows={
                          d.responseSeconds === null
                            ? []
                            : [{ label: 'Average seconds', value: d.responseSeconds }]
                        }
                      />
                      <Bars
                        title="Conversion by stage"
                        summary={`${d.stages.find((s) => s.label === 'paid')?.value ?? 0} of ${d.conversationCount} active leads are currently paid. This is a stage snapshot, not a historical funnel or transition rate.`}
                        rows={d.stages}
                        format={(n) =>
                          `${n} (${Math.round((n / Math.max(1, d.conversationCount)) * 100)}%)`
                        }
                      />
                      <Bars
                        title="Top products"
                        summary="Best sellers by units on confirmed paid, non-cancelled orders in this range."
                        rows={d.topProducts}
                      />
                      <Bars
                        title="Revenue over time"
                        summary={`${naira(d.revenueKobo)} confirmed revenue including delivery. Grouped by payment date; cancelled orders excluded.`}
                        rows={d.dailySales.map((s) => ({ label: s.date, value: s.revenueKobo }))}
                        format={naira}
                      />
                      <Bars
                        title="Busiest hours"
                        summary={
                          peak?.value
                            ? `Most incoming customer messages arrived in the two-hour window starting ${peak.label} WAT.`
                            : 'No incoming customer messages in this range.'
                        }
                        rows={d.hours}
                      />
                      <Bars
                        title="AI versus vendor"
                        summary={
                          total
                            ? `AI sent ${Math.round((d.handling[0].value / total) * 100)}% of ${total} sent replies. This is message share, not fully automated chats.`
                            : 'No sent replies in this range.'
                        }
                        rows={d.handling}
                        format={(n) => `${n} (${Math.round((n / Math.max(1, total)) * 100)}%)`}
                      />
                    </div>
                  </>
                );
              }}
            </ResourceView>
          )}
        </>
      )}
    </section>
  );
}
