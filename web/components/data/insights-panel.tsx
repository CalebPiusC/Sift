'use client';
import { useCallback, useState } from 'react';
import { useDataClient } from './provider';
import { useResource } from '../../lib/data/use-resource';
import { ResourceView, naira, panel } from './shared';

export function InsightsPanel() {
  const { client } = useDataClient();
  const insights = useResource(useCallback(() => client.insights.get(), [client]));
  return (
    <ResourceView resource={insights}>
      {(data) => (
        <section>
          <h2 className="mb-6 text-xl font-semibold">A little clarity for your next move.</h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              ['Sales', naira(data.revenueKobo)],
              ['Orders', data.orderCount],
              ['Conversations', data.conversationCount],
              ['Pending approvals', data.pendingApprovals],
            ].map(([title, value]) => (
              <article key={title} className={panel}>
                <p className="text-xs text-slate-500">{title}</p>
                <p className="mt-4 text-2xl font-semibold">{value}</p>
              </article>
            ))}
          </div>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <section className={panel}>
              <h3 className="mb-5 font-semibold">Where conversations happen</h3>
              {data.byChannel.map((c) => (
                <div key={c.channel} className="mb-5">
                  <p className="mb-2 flex justify-between text-xs capitalize">
                    <span>{c.channel}</span>
                    <span>{c.conversations}</span>
                  </p>
                  <div className="h-2 rounded-full bg-indigo-50 dark:bg-indigo-950">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{
                        width: `${(c.conversations / Math.max(1, data.conversationCount)) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </section>
            <section className={panel}>
              <h3 className="mb-5 font-semibold">Daily sales</h3>
              {data.dailySales.map((d) => (
                <div
                  key={d.date}
                  className="flex justify-between border-b border-slate-100 py-4 text-xs dark:border-slate-800"
                >
                  <span>{d.date}</span>
                  <span className="font-semibold">{naira(d.revenueKobo)}</span>
                </div>
              ))}
              <p className="mt-5 text-xs leading-6 text-slate-400">
                Paid orders, including delivery. Cancelled and refunded orders excluded. No invented
                forecasts.
              </p>
            </section>
          </div>
        </section>
      )}
    </ResourceView>
  );
}
