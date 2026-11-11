import type { Order, OrderStatus } from './types';
import { naira } from './money';
export const orderLabels: Record<OrderStatus, string> = {
  draft: 'Draft',
  awaiting_payment: 'Awaiting payment',
  paid: 'Paid',
  preparing: 'Preparing',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};
export const orderTransitions: Record<OrderStatus, OrderStatus[]> = {
  draft: ['awaiting_payment', 'cancelled'],
  awaiting_payment: ['cancelled'],
  paid: ['preparing', 'cancelled'],
  preparing: ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered'],
  delivered: [],
  cancelled: [],
};
export function deliveryMessage(
  o: Pick<Order, 'id' | 'totalKobo'>,
  status: OrderStatus,
): string | null {
  const messages: Record<OrderStatus, string | null> = {
    draft: null,
    awaiting_payment: `Your order ${o.id} is awaiting payment. Total: ${naira(o.totalKobo)}.`,
    paid: `Payment received for order ${o.id}. Thank you!`,
    preparing: `We’re preparing your order ${o.id}.`,
    out_for_delivery: `Your order ${o.id} is out for delivery.`,
    delivered: `Your order ${o.id} has been delivered. Thank you for shopping with us!`,
    cancelled: `Your order ${o.id} has been cancelled. Please contact us if you have any questions.`,
  };
  return messages[status];
}
export function validOrderTotals(o: Order) {
  return (
    o.items.length > 0 &&
    o.items.every(
      (i) =>
        Number.isSafeInteger(i.quantity) &&
        i.quantity > 0 &&
        Number.isSafeInteger(i.unitPriceKobo) &&
        i.unitPriceKobo >= 0,
    ) &&
    Number.isSafeInteger(o.deliveryFeeKobo) &&
    o.deliveryFeeKobo >= 0 &&
    Number.isSafeInteger(o.totalKobo) &&
    o.totalKobo ===
      o.items.reduce((n, i) => n + i.quantity * i.unitPriceKobo, 0) + o.deliveryFeeKobo
  );
}
