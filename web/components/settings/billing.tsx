'use client';
import { useCallback, useState } from 'react';
import { useDataClient } from '../data/provider';
import { useResource } from '../../lib/data/use-resource';
import { ResourceView, panel, naira, useAction } from '../data/shared';
import { Button } from '../ui/button';
export function BillingSettings() {
  const { client } = useDataClient();
  const billing = useResource(useCallback(() => client.billing.get(), [client]));
  const action = useAction();
  const [message, setMessage] = useState('');
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Billing that fits your business</h2>
      <p className="text-sm leading-6 text-slate-500">
        Sample pricing, not a commercial offer. Paystack buttons are placeholders: no charge,
        subscription change or bundle credit is made.
      </p>
      <ResourceView resource={billing}>
        {(b) => (
          <>
            {b.status === 'trial' && (
              <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">
                <strong>
                  Trial ·{' '}
                  {Math.max(0, Math.ceil((Date.parse(b.trialEndsAt) - Date.now()) / 86400000))} days
                  remaining
                </strong>
                <p className="mt-2 text-xs">
                  Ends {new Date(b.trialEndsAt).toLocaleDateString('en-NG')}. No automatic payment
                  is scheduled in this mock.
                </p>
              </div>
            )}
            <section className={panel}>
              <h3 className="font-semibold capitalize">Current plan: {b.plan}</h3>
              <p className="my-3 text-xs text-slate-500">
                {b.usage.conversations} of {b.usage.limit} conversations used · {b.bundleBalance}{' '}
                bundle credits
              </p>
              <progress
                className="h-4 w-full accent-primary"
                aria-label="Conversation usage"
                max={b.usage.limit}
                value={Math.min(b.usage.conversations, b.usage.limit)}
              />
              <p className="mt-3 text-xs text-slate-500">
                Monthly price {naira(b.monthlyPriceKobo)} · Sample renewal date{' '}
                {new Date(b.nextBillingAt).toLocaleDateString('en-NG')}
              </p>
            </section>
            {message && (
              <p
                role="status"
                className="rounded-xl border border-indigo-200 p-4 text-xs text-primary dark:text-indigo-300"
              >
                {message}
              </p>
            )}
            {(['monthly', 'yearly', 'volume', 'bundle'] as const).map((kind) => (
              <section key={kind}>
                <h3 className="mb-3 mt-6 text-base font-semibold">
                  {
                    {
                      monthly: 'Monthly plans',
                      yearly: 'Yearly · about two months free',
                      volume: 'Volume tiers',
                      bundle: 'Pay-as-you-go bundles',
                    }[kind]
                  }
                </h3>
                <div className="grid gap-4 md:grid-cols-2">
                  {b.offers
                    .filter((o) => o.kind === kind)
                    .map((offer) => (
                      <article
                        key={offer.id}
                        aria-label={offer.name}
                        className={`${panel} ${b.selectedOfferId === offer.id ? 'border-indigo-400' : ''}`}
                      >
                        <h4 className="font-semibold">{offer.name}</h4>
                        <p className="my-4 text-2xl font-semibold">
                          {naira(offer.priceKobo)}
                          <span className="ml-1 text-xs font-normal text-slate-500">
                            {kind === 'yearly'
                              ? '/ year'
                              : kind === 'bundle'
                                ? '/ bundle'
                                : '/ month'}
                          </span>
                        </p>
                        <p className="text-xs leading-6 text-slate-500">{offer.description}</p>
                        <p className="my-3 text-xs">
                          {offer.conversations.toLocaleString('en-NG')} conversations
                          {kind === 'yearly'
                            ? ' / month'
                            : kind === 'bundle'
                              ? ' total'
                              : ' / month'}
                        </p>
                        {b.selectedOfferId === offer.id && (
                          <p className="my-3 text-xs font-semibold text-primary dark:text-indigo-300">
                            Selected · no purchase made
                          </p>
                        )}
                        <Button
                          variant="outline"
                          disabled={action.busy}
                          onClick={() =>
                            void action
                              .run(() => client.billing.selectOffer({ offerId: offer.id }))
                              .then((r) => {
                                if (r.ok)
                                  setMessage(
                                    `${offer.name} selected. Paystack checkout is a placeholder. No payment or entitlement change was made.`,
                                  );
                              })
                          }
                        >
                          Paystack · select {offer.name}
                        </Button>
                      </article>
                    ))}
                </div>
              </section>
            ))}
          </>
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
