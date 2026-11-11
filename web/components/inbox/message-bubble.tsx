import { Mic, Sparkles } from 'lucide-react';
import type { Message } from '../../lib/data';
import { orderLabels } from '../../lib/data/order-logic';
import { naira } from '../../lib/data/money';
export const messageTime = (time: string) =>
  new Date(time).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
export function MessageBubble({
  message: m,
  sample = false,
}: {
  message: Message;
  sample?: boolean;
}) {
  return (
    <div className={`flex ${m.sender === 'customer' ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`min-w-0 max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-6 ${m.status === 'pending_approval' ? 'bubble-pending border-2 border-dashed border-amber-400' : m.sender === 'customer' ? 'bubble-customer' : m.sender === 'ai' ? 'bubble-ai' : 'bubble-vendor border border-slate-200 dark:border-slate-700'}`}
      >
        {m.sender === 'ai' ? (
          <span className="mb-1 flex items-center gap-1 text-[10px] font-bold">
            <Sparkles size={10} />
            AI
          </span>
        ) : (
          <span className="mb-1 block text-[10px] font-semibold text-slate-500">
            {m.sender === 'vendor' ? 'You' : 'Customer'}
          </span>
        )}
        {m.kind === 'voice' && m.voice ? (
          <>
            <p className="flex items-center gap-2 font-medium">
              <Mic size={16} />
              Voice note{m.voice.durationSeconds != null ? ` · ${m.voice.durationSeconds}s` : ''}
            </p>
            <p className="mt-2 text-xs">Transcript: {m.voice.transcript}</p>
            <p className="mt-1 text-[10px] text-slate-500">
              Original language:{' '}
              {(m.voice.detectedLanguage ?? m.language) === 'pcm'
                ? 'Nigerian Pidgin'
                : (m.voice.detectedLanguage ?? m.language) === 'en'
                  ? 'English'
                  : 'Other / unverified language'}{' '}
              · transcript, not a translation
            </p>
            {m.voice.audioUrl ? (
              <audio controls preload="none" className="mt-2 w-full" src={m.voice.audioUrl} />
            ) : (
              <p className="text-[10px] text-slate-500">No public audio link is available.</p>
            )}
          </>
        ) : (
          <p className="whitespace-pre-wrap break-words">{m.text}</p>
        )}
        {m.sender === 'customer' && m.language !== 'en' && (
          <section
            aria-label="Language summary"
            className="my-3 grid grid-cols-2 gap-3 rounded-xl border border-slate-300 p-3 dark:border-slate-600"
          >
            <div className="min-w-0">
              <h4 className="text-[10px] font-bold">Original · Nigerian Pidgin</h4>
              <p className="mt-2 whitespace-pre-wrap break-words text-xs">
                {m.voice?.transcript || m.text}
              </p>
            </div>
            <div className="min-w-0">
              <h4 className="text-[10px] font-bold">English summary</h4>
              <p className="mt-2 break-words text-xs">
                {m.englishSummary || 'Summary unavailable. Review the original before replying.'}
              </p>
              {m.englishSummary && sample && (
                <p className="mt-2 text-[10px] text-slate-500">
                  Sample summary · not live translation
                </p>
              )}
            </div>
          </section>
        )}
        {m.product && (
          <article
            aria-label="Shared product"
            className="my-2 rounded-xl border border-indigo-200 bg-white/70 p-3 text-slate-900 dark:border-indigo-800 dark:bg-slate-900 dark:text-slate-100"
          >
            <p className="text-[10px] uppercase text-slate-500">Catalogue item · shared snapshot</p>
            <h4 className="font-semibold">{m.product.name}</h4>
            <p>{naira(m.product.priceKobo)}</p>
            <p className="text-xs">
              {m.product.stock === null ? 'Stock not tracked' : `${m.product.stock} in stock`}
            </p>
          </article>
        )}
        {m.order && (
          <article
            aria-label="Order summary"
            className="my-2 rounded-xl border border-slate-200 bg-white/70 p-3 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <h4 className="font-semibold">Order summary · {m.order.id}</h4>
            {m.order.items.map((item, i) => (
              <p key={i} className="text-xs">
                {item.quantity} × {item.name} · {naira(item.unitPriceKobo)}
              </p>
            ))}
            <p className="mt-2 font-semibold">Total {naira(m.order.totalKobo)}</p>
            <p className="text-xs capitalize">
              {orderLabels[m.order.status]} ·{' '}
              {m.order.paymentStatus === 'paid' ? 'Payment confirmed' : 'Awaiting verified payment'}
            </p>
            <p className="text-[10px] text-slate-500">
              Snapshot when shared. A screenshot is not proof of payment.
            </p>
          </article>
        )}
        {m.status === 'failed' && (
          <p role="status" className="mt-2 text-xs font-semibold text-danger">
            {m.deliveryErrorCode === 'DELIVERY_UNCERTAIN'
              ? 'Sending could not be confirmed. Check Gmail Sent; retry only reconciles and will not send a duplicate.'
              : 'Reply failed. Review the channel connection and retry.'}
          </p>
        )}
        {!sample && m.status === 'sent' && (
          <p className="text-[10px] text-slate-500">
            Accepted by Gmail · recipient delivery is not confirmed
          </p>
        )}
        <p className="mt-1 text-right text-[10px] text-slate-600 dark:text-slate-300">
          <time dateTime={m.createdAt}>{messageTime(m.createdAt)}</time>
          {m.sender !== 'customer' &&
            ` · ${m.status === 'sent' ? (sample ? 'Sent (sample)' : 'Sent') : m.status.replaceAll('_', ' ')}`}
        </p>
      </div>
    </div>
  );
}
