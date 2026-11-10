import type { OrdersData, ReceiptsData } from './contract';
import type { Seed } from './seed';
import type {
  DataEvent,
  ID,
  ListInput,
  Message,
  Order,
  Page,
  Product,
  Result,
  StockMovement,
} from './types';
import { deliveryMessage, orderLabels, orderTransitions, validOrderTotals } from './order-logic';
type Run = <T>(area: DataEvent['area'], work: () => Result<T>) => Promise<Result<T>>;
const ok = <T>(data: T): Result<T> => ({ ok: true, data: structuredClone(data) });
const fail = (code: 'NOT_FOUND' | 'VALIDATION' | 'CONFLICT', message: string): Result<never> => ({
  ok: false,
  error: { code, message, retryable: false },
});
export function ordersMock(ctx: {
  state: Seed;
  vendorId: ID;
  id: (prefix: string) => ID;
  run: Run;
  emit: (area: DataEvent['area'], id: ID, type?: DataEvent['type']) => void;
  page: <T>(rows: T[], input?: ListInput) => Result<Page<T>>;
  addMessage: (conversationId: ID, text: string, sender: Message['sender']) => Result<Message>;
}): {
  orders: OrdersData;
  receipts: ReceiptsData;
  screenshot: (orderId: ID) => Promise<Result<Order>>;
} {
  const { state, vendorId, id, run, emit, page, addMessage } = ctx;
  function timeline(o: Order, label: string, message: string | null) {
    o.timeline.push({
      id: id('event'),
      at: new Date().toISOString(),
      label,
      customerMessage: message,
    });
  }
  function changed(o: Order) {
    o.revision++;
    const message = o.timeline.at(-1)?.customerMessage;
    if (
      message &&
      o.conversationId &&
      state.conversations.some((c) => c.id === o.conversationId && c.customerId === o.customerId)
    )
      addMessage(o.conversationId, message, 'vendor');
    emit('orders', o.id);
    emit('insights', vendorId);
  }
  // Stage stock on detached copies first; apply once after all payment validations.
  function stock(o: Order): { products: Product[]; movements: StockMovement[] } {
    const products = new Map<ID, Product>();
    const movements: StockMovement[] = [];
    for (const item of o.items) {
      const existing = state.products.find((p) => p.id === item.productId);
      let deducted = 0,
        note = 'Item unavailable in the current catalogue.';
      if (existing) {
        const p = products.get(existing.id) ?? structuredClone(existing);
        products.set(p.id, p);
        if (p.stock === null) {
          note = 'Stock not tracked; no quantity deducted.';
          movements.push({
            productId: item.productId,
            variantId: item.variantId,
            requested: item.quantity,
            deducted: 0,
            shortfall: 0,
            note,
          });
          continue;
        }
        if (p.variants.length) {
          const v = p.variants.find((v) => v.id === item.variantId);
          if (v && v.stock !== null) {
            deducted = Math.min(v.stock, item.quantity);
            v.stock -= deducted;
            p.stock = p.variants.reduce((n, v) => n + (v.stock ?? 0), 0);
            note =
              deducted < item.quantity
                ? 'Variant stock shortage. Arrange restock or fulfilment with the customer.'
                : 'Variant stock deducted.';
          } else
            note =
              'The ordered variant could not be matched. Review fulfilment; no guessed stock deduction.';
        } else if (item.variantId === null) {
          deducted = Math.min(p.stock, item.quantity);
          p.stock -= deducted;
          note =
            deducted < item.quantity
              ? 'Stock shortage. Arrange restock or fulfilment with the customer.'
              : 'Stock deducted.';
        } else note = 'The ordered variant is missing. Review fulfilment.';
      }
      movements.push({
        productId: item.productId,
        variantId: item.variantId,
        requested: item.quantity,
        deducted,
        shortfall: item.quantity - deducted,
        note,
      });
    }
    return { products: [...products.values()], movements };
  }
  const orders: OrdersData = {
    list: (input) =>
      run('orders', () =>
        page(
          state.orders
            .filter(
              (o) =>
                (!input?.status || o.status === input.status) &&
                (!input?.search ||
                  `${o.id} ${o.customerName} ${o.items.map((i) => i.name).join(' ')}`
                    .toLowerCase()
                    .includes(input.search.toLowerCase())),
            )
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
          input,
        ),
      ),
    get: (key) =>
      run('orders', () => {
        const o = state.orders.find((o) => o.id === key);
        return o ? ok(o) : fail('NOT_FOUND', 'Order not found.');
      }),
    setStatus: (input) =>
      run('orders', () => {
        const o = state.orders.find((o) => o.id === input.id);
        if (!o) return fail('NOT_FOUND', 'Order not found.');
        if (o.revision !== input.expectedRevision)
          return fail('CONFLICT', 'This order changed. Review the latest details before updating.');
        if (o.status === input.status) return ok(o);
        if (!orderTransitions[o.status].includes(input.status))
          return fail(
            'CONFLICT',
            'That order transition is not allowed. Payment must be confirmed separately.',
          );
        if (
          !['draft', 'awaiting_payment', 'cancelled'].includes(input.status) &&
          o.paymentStatus !== 'paid'
        )
          return fail('CONFLICT', 'Confirm payment before preparing or delivering this order.');
        o.status = input.status;
        if (input.status === 'awaiting_payment')
          o.paymentLink = `https://paystack.com/pay/selvora-sample-do-not-pay-${o.id}`;
        timeline(o, orderLabels[input.status], deliveryMessage(o, input.status));
        changed(o);
        return ok(o);
      }),
    confirmPayment: (input) =>
      run('orders', () => {
        const o = state.orders.find((o) => o.id === input.id);
        if (!o) return fail('NOT_FOUND', 'Order not found.');
        if (input.source !== 'vendor')
          return fail(
            'VALIDATION',
            'Only explicit vendor confirmation is accepted. A screenshot is not verification.',
          );
        if (o.paymentStatus === 'paid') return ok(o); // idempotent retry, never double-deduct
        if (o.revision !== input.expectedRevision)
          return fail('CONFLICT', 'This order changed. Check the amount and confirm again.');
        if (o.status !== 'awaiting_payment')
          return fail(
            'CONFLICT',
            'Move this order to awaiting payment before confirming a bank transfer.',
          );
        if (!validOrderTotals(o))
          return fail(
            'VALIDATION',
            'Order totals are inconsistent. Review the order before accepting payment.',
          );
        const staged = stock(o);
        const updatedProducts: ID[] = [];
        for (const p of staged.products) {
          const original = state.products.find((x) => x.id === p.id)!;
          if (JSON.stringify(original) !== JSON.stringify(p)) {
            p.revision++;
            Object.assign(original, p);
            updatedProducts.push(p.id);
          }
        }
        o.stockMovements = staged.movements;
        o.paymentStatus = 'paid';
        o.paymentSource = 'vendor';
        o.paidAt = new Date().toISOString();
        o.status = 'paid';
        for (const c of state.conversations.filter((c) => c.customerId === o.customerId)) {
          c.stage = 'paid';
        }
        timeline(o, 'Payment verified by vendor', deliveryMessage(o, 'paid'));
        changed(o);
        for (const key of updatedProducts) emit('catalogue', key);
        for (const c of state.conversations.filter((c) => c.customerId === o.customerId))
          emit('conversations', c.id);
        return ok(o);
      }),
  };
  const receipts: ReceiptsData = {
    list: (input) =>
      run('receipts', () =>
        page(
          state.receipts.filter(
            (r) =>
              !input?.search ||
              `${r.number} ${r.customerName} ${r.orderId}`
                .toLowerCase()
                .includes(input.search.toLowerCase()),
          ),
          input,
        ),
      ),
    get: (key) =>
      run('receipts', () => {
        const r = state.receipts.find((r) => r.id === key);
        return r ? ok(r) : fail('NOT_FOUND', 'Receipt not found.');
      }),
    issue: (input) =>
      run('receipts', () => {
        const existing = state.receipts.find((r) => r.orderId === input.orderId);
        if (existing) return ok(existing);
        const o = state.orders.find((o) => o.id === input.orderId);
        if (!o) return fail('NOT_FOUND', 'Order not found.');
        if (o.paymentStatus !== 'paid' || !o.paymentSource || !validOrderTotals(o))
          return fail(
            'CONFLICT',
            'Verified payment and consistent totals are required to issue a receipt.',
          );
        const r = {
          id: id('receipt'),
          vendorId,
          orderId: o.id,
          number: Math.max(0, ...state.receipts.map((r) => r.number)) + 1,
          vendorName: state.settings.businessName,
          subtotalKobo: o.items.reduce((n, i) => n + i.quantity * i.unitPriceKobo, 0),
          paymentSource: o.paymentSource,
          shareUrl: null,
          totalKobo: o.totalKobo,
          items: structuredClone(o.items),
          deliveryFeeKobo: o.deliveryFeeKobo,
          customerName: o.customerName,
          issuedAt: new Date().toISOString(),
        };
        state.receipts.push(r);
        timeline(o, `Receipt #${String(r.number).padStart(4, '0')} issued`, null);
        changed(o);
        emit('receipts', r.id, 'created');
        return ok(r);
      }),
  };
  return {
    orders,
    receipts,
    screenshot: (orderId) =>
      run('orders', () => {
        const o = state.orders.find((o) => o.id === orderId);
        if (!o) return fail('NOT_FOUND', 'Order not found.');
        if (!o.paymentScreenshotReceived) {
          o.paymentScreenshotReceived = true;
          timeline(o, 'Customer sent a payment screenshot · unverified', null);
          changed(o);
        }
        return ok(o);
      }),
  };
}
