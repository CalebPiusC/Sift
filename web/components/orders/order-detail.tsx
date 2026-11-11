'use client';
import { useCallback, useState } from 'react';
import type { Order, OrderStatus } from '../../lib/data';
import { useResource } from '../../lib/data/use-resource';
import { orderLabels, orderTransitions, deliveryMessage } from '../../lib/data/order-logic';
import { safePaymentLink } from '../../lib/data/receipt-share';
import { useDataClient } from '../data/provider';
import { ResourceView, panel, naira, useAction } from '../data/shared';
import { Button } from '../ui/button';
import { ShareLink } from './share-link';
import { ReceiptView } from './receipt-view';
import { StockPrompts } from './stock-prompts';
export function OrderDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { client } = useDataClient();
  const order = useResource(useCallback(() => client.orders.get(id), [client, id]));
  const receipts = useResource(useCallback(() => client.receipts.list({ limit: 100 }), [client]));
  return (
    <div className="space-y-4">
      <Button variant="outline" onClick={onBack}>
        Back to orders
      </Button>
      <ResourceView resource={order}>
        {(o) => (
          <>
            <OrderContent order={o} />
            {o.paymentStatus === 'paid' && (
              <>
                <StockPrompts order={o} />
                <ResourceView resource={receipts}>
                  {(page) => {
                    const r = page.items.find((r) => r.orderId === o.id);
                    return r ? (
                      <div>
                        <ReceiptView receipt={r} sample={client.mode === 'mock'} />
                        {client.mode === 'api' && <ReceiptLinks id={r.id} />}
                      </div>
                    ) : (
                      <IssueReceipt orderId={o.id} />
                    );
                  }}
                </ResourceView>
              </>
            )}
          </>
        )}
      </ResourceView>
    </div>
  );
}
function IssueReceipt({ orderId }: { orderId: string }) {
  const { client } = useDataClient();
  const action = useAction();
  return (
    <section className={panel}>
      <h3 className="font-semibold">Digital receipt</h3>
      <p className="my-3 text-xs leading-6 text-slate-500">
        Issue a numbered, read-only payment receipt. Items, totals, customer and your business name
        will be frozen at issuance. It can be issued only once per order.
      </p>
      <Button
        disabled={action.busy}
        onClick={() => void action.run(() => client.receipts.issue({ orderId }))}
      >
        Issue receipt
      </Button>
      {action.error && (
        <p role="alert" className="mt-3 text-xs text-danger">
          {action.error.message}
        </p>
      )}
    </section>
  );
}
function OrderContent({ order: o }: { order: Order }) {
  const { client } = useDataClient();
  const action = useAction();
  const [confirm, setConfirm] = useState<{ revision: number; total: number } | null>(null),
    [checked, setChecked] = useState(false);
  const [cancel, setCancel] = useState(false);
  const link = safePaymentLink(o.paymentLink);
  const next = orderTransitions[o.status].filter((s) => s !== 'cancelled');
  function status(status: OrderStatus) {
    void action
      .run(() => client.orders.setStatus({ id: o.id, status, expectedRevision: o.revision }))
      .then((r) => {
        if (r.ok) setCancel(false);
      });
  }
  return (
    <>
      <section className={`${panel} min-w-0`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs text-slate-500">{o.id}</p>
            <h2 className="mt-1 text-xl font-semibold">{o.customerName}</h2>
          </div>
          <span className="rounded-full bg-indigo-50 px-3 py-2 text-xs font-semibold text-primary dark:bg-indigo-950 dark:text-indigo-300">
            {orderLabels[o.status]}
          </span>
        </div>
        {o.paymentReview && (
          <p role="alert" className="my-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            Review needed: {o.paymentReview.replaceAll('_', ' ')}. Draft totals may be provisional
            until chat details are complete.
          </p>
        )}
        {o.refundStatus && (
          <p role="status" className="my-3 text-sm">
            Refund: {o.refundStatus}. A request is not proof of a completed refund.
          </p>
        )}
        <h3 className="mb-3 mt-6 text-sm font-semibold">Items</h3>
        <ul className="space-y-3">
          {o.items.map((item, i) => (
            <li
              key={i}
              className="flex justify-between gap-3 border-b border-slate-100 pb-3 text-sm dark:border-slate-800"
            >
              <div className="min-w-0">
                <p className="break-words font-semibold">
                  {item.quantity} × {item.name}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {naira(item.unitPriceKobo)} each
                  {item.variantId ? ` · ${item.variantName ?? 'Selected variant'}` : ''}
                </p>
              </div>
              <span className="shrink-0">{naira(item.quantity * item.unitPriceKobo)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex justify-between gap-2">
            <dt>Delivery</dt>
            <dd>{naira(o.deliveryFeeKobo)}</dd>
          </div>
          <div className="flex justify-between gap-2 text-lg font-semibold">
            <dt>Total</dt>
            <dd>{naira(o.totalKobo)}</dd>
          </div>
        </dl>
        <h3 className="mb-2 mt-6 text-sm font-semibold">Delivery address</h3>
        <address className="whitespace-pre-wrap break-words text-sm not-italic leading-6 text-slate-500">
          {o.deliveryAddress}
        </address>
        <h3 className="mb-2 mt-6 text-sm font-semibold">Payment status</h3>
        <p
          className={`text-sm font-semibold ${o.paymentStatus === 'paid' ? 'text-success' : 'text-warning'}`}
        >
          {o.paymentStatus === 'paid'
            ? `Payment verified · ${o.paymentSource === 'vendor' ? 'Vendor bank check' : 'Paystack webhook'}`
            : 'Not paid · awaiting verification'}
        </p>
        {o.paidAt && (
          <p className="mt-1 text-xs text-slate-500">
            {new Date(o.paidAt).toLocaleString('en-NG')}
          </p>
        )}
        {o.paymentScreenshotReceived && (
          <div
            role="note"
            className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100"
          >
            <strong>Customer sent a payment screenshot</strong>
            <p className="mt-2">Screenshots can be faked. Check your bank before confirming.</p>
            <p className="mt-2 text-xs">A screenshot never changes payment status.</p>
          </div>
        )}
        {client.developer && o.paymentStatus === 'unpaid' && !o.paymentScreenshotReceived && (
          <Button
            variant="outline"
            className="mt-4"
            disabled={action.busy}
            onClick={() =>
              void action.run(() => client.developer!.simulatePaymentScreenshot({ orderId: o.id }))
            }
          >
            Simulate payment screenshot
          </Button>
        )}
        {o.status === 'awaiting_payment' && o.paymentStatus === 'unpaid' && !confirm && (
          <Button
            className="mt-5 w-full bg-success hover:bg-green-700 sm:w-auto"
            disabled={action.busy}
            onClick={() => {
              setConfirm({ revision: o.revision, total: o.totalKobo });
              setChecked(false);
            }}
          >
            Payment received
          </Button>
        )}
        {confirm && o.paymentStatus === 'unpaid' && (
          <div
            aria-label="Confirm bank transfer"
            className="mt-5 space-y-4 rounded-xl border-2 border-emerald-500 p-4"
          >
            <h3 className="font-semibold">Confirm bank transfer</h3>
            <p className="text-sm leading-6">
              Record {naira(confirm.total)} received for {o.id}? Check the transaction in your bank
              app—not a screenshot, SMS alert or customer claim.
            </p>
            <p className="text-xs text-slate-500">
              This marks the order paid, deducts tracked stock once, and sends “
              {deliveryMessage(o, 'paid')}” to the customer
              {client.mode === 'mock' ? ' (sample only)' : ''}.
            </p>
            <label className="flex min-h-12 items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="!w-5 shrink-0"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
              />
              I checked my bank and received the full amount.
            </label>
            {o.revision !== confirm.revision && (
              <p role="alert" className="text-xs text-danger">
                This order changed. Cancel and review the latest details.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={action.busy || !checked || o.revision !== confirm.revision}
                onClick={() =>
                  void action
                    .run(() =>
                      client.orders.confirmPayment({
                        id: o.id,
                        source: 'vendor',
                        confirmed: true,
                        expectedRevision: confirm.revision,
                      }),
                    )
                    .then((r) => {
                      if (r.ok) setConfirm(null);
                    })
                }
              >
                Confirm payment received
              </Button>
              <Button variant="outline" disabled={action.busy} onClick={() => setConfirm(null)}>
                Cancel confirmation
              </Button>
            </div>
          </div>
        )}
        <h3 className="mb-3 mt-6 text-sm font-semibold">Update order</h3>
        {next.map((s) => (
          <div key={s} className="mb-4 rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
            <p className="mb-3 text-xs leading-6 text-slate-500">
              Customer will receive{client.mode === 'mock' ? ' (sample)' : ''}: “
              {deliveryMessage(o, s)}”
            </p>
            <Button disabled={action.busy} onClick={() => status(s)}>
              Mark {orderLabels[s].toLowerCase()}
            </Button>
          </div>
        ))}
        {!next.length && (
          <p className="text-xs text-slate-500">
            {o.status === 'awaiting_payment'
              ? 'Confirm payment before preparing this order.'
              : 'No further delivery updates available.'}
          </p>
        )}
        {orderTransitions[o.status].includes('cancelled') && (
          <div className="mt-4">
            {cancel ? (
              <div className="space-y-3 rounded-xl border border-red-200 p-3">
                <p className="text-xs leading-6">
                  Cancel this order? The customer will receive: “{deliveryMessage(o, 'cancelled')}”
                  Cancellation does not refund a payment or automatically restock items. Issued
                  receipts stay unchanged.
                </p>
                <Button
                  variant="outline"
                  disabled={action.busy}
                  onClick={() => status('cancelled')}
                >
                  Confirm cancellation
                </Button>
                <Button variant="outline" onClick={() => setCancel(false)}>
                  Keep order
                </Button>
              </div>
            ) : (
              <Button variant="outline" disabled={action.busy} onClick={() => setCancel(true)}>
                Cancel order
              </Button>
            )}
          </div>
        )}
        {o.status === 'awaiting_payment' && client.orders.requestCheckout && !link && (
          <Button
            disabled={action.busy}
            onClick={() => void action.run(() => client.orders.requestCheckout!(o.id))}
          >
            Create Paystack checkout
          </Button>
        )}
        {o.status === 'cancelled' &&
          o.paymentStatus === 'paid' &&
          client.orders.cancellationActions && <CancellationActions order={o} />}
        {action.error && (
          <p role="alert" className="mt-4 text-xs text-danger">
            {action.error.message}
          </p>
        )}
      </section>
      {link && o.status !== 'draft' && o.status !== 'cancelled' && o.paymentStatus === 'unpaid' && (
        <section className={`${panel} min-w-0`} aria-label="Payment link">
          <h3 className="mb-3 font-semibold">
            {client.mode === 'mock' ? 'Sample Paystack link' : 'Paystack payment link'}
          </h3>
          {client.mode === 'mock' && (
            <p className="mb-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              Demo URL only. It is not a live payment checkout. Do not pay through this sample link.
            </p>
          )}
          <ShareLink
            url={link}
            title={`${client.mode === 'mock' ? 'Sample ' : ''}payment link · ${o.id}`}
            label="Payment link URL"
          />
        </section>
      )}
      <section className={panel}>
        <h3 className="mb-4 font-semibold">Order timeline</h3>
        <ol className="space-y-4 border-l-2 border-indigo-100 pl-4 dark:border-indigo-900">
          {o.timeline.map((event) => (
            <li key={event.id}>
              <p className="text-sm font-semibold">{event.label}</p>
              <time className="mt-1 block text-[10px] text-slate-500" dateTime={event.at}>
                {new Date(event.at).toLocaleString('en-NG')}
              </time>
              {event.customerMessage && (
                <p className="mt-2 text-xs leading-6 text-slate-500">
                  Customer message{client.mode === 'mock' ? ' (sample)' : ''}:{' '}
                  {event.customerMessage}
                </p>
              )}
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

function CancellationActions({ order: o }: { order: Order }) {
  const { client } = useDataClient();
  const action = useAction();
  const [refund, setRefund] = useState(false),
    [restock, setRestock] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  return (
    <section className="my-4 space-y-3 rounded-xl border border-amber-400 p-3">
      <h3 className="font-semibold">Explicit cancellation choices</h3>
      <p className="text-xs">
        Nothing was refunded or restocked by cancellation. Bank refunds must be made in your bank
        app. Paystack refund requests remain pending until reconciled.
      </p>
      <label className="flex min-h-12 gap-3">
        <input
          type="checkbox"
          checked={refund}
          onChange={(e) => {
            setRefund(e.target.checked);
            setConfirmed(false);
          }}
        />
        Request full refund
      </label>
      <label className="flex min-h-12 gap-3">
        <input
          type="checkbox"
          checked={restock}
          disabled={!!o.restockedAt}
          onChange={(e) => {
            setRestock(e.target.checked);
            setConfirmed(false);
          }}
        />
        Return deducted items to available stock
      </label>
      <label className="flex min-h-12 gap-3">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        I confirm these choices. Stock will be available to sell again if restock is selected.
      </label>
      <Button
        disabled={action.busy || !confirmed || (!refund && !restock)}
        onClick={() =>
          void action.run(() =>
            client.orders.cancellationActions!({ id: o.id, refund, restock, confirmed: true }),
          )
        }
      >
        Apply confirmed choices
      </Button>
      {action.error && (
        <p role="alert" className="text-sm text-danger">
          {action.error.message}
        </p>
      )}
    </section>
  );
}
function ReceiptLinks({ id }: { id: string }) {
  const { client } = useDataClient();
  const action = useAction();
  const [confirm, setConfirm] = useState(false);
  return (
    <section className="my-3 space-y-3">
      <Button
        variant="outline"
        disabled={action.busy}
        onClick={() => void action.run(() => client.receipts.share!(id))}
      >
        Create or renew secure receipt link
      </Button>
      {!confirm ? (
        <Button variant="outline" onClick={() => setConfirm(true)}>
          Revoke receipt links
        </Button>
      ) : (
        <Button
          variant="outline"
          disabled={action.busy}
          onClick={() =>
            void action
              .run(() => client.receipts.revoke!(id))
              .then((r) => {
                if (r.ok) setConfirm(false);
              })
          }
        >
          Confirm revoke all current receipt links
        </Button>
      )}
      {action.error && (
        <p role="alert" className="text-sm text-danger">
          {action.error.message}
        </p>
      )}
    </section>
  );
}
