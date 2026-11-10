import type { AutoIntent, BusinessSettings } from './types';
export const intentLabels: Record<AutoIntent, string> = {
  greeting: 'Greeting',
  price: 'Price',
  availability: 'Availability',
  variants: 'Variants',
  delivery_info: 'Delivery info',
  order_status: 'Order status',
  alternatives: 'Alternatives',
};
export function counterOffer(offer: number, list: number, floor: number): number | null {
  if (
    ![offer, list, floor].every((n) => Number.isSafeInteger(n) && n >= 0) ||
    list <= 0 ||
    floor > list
  )
    return null;
  const midpoint = offer / 2 + list / 2;
  return Math.max(floor, Math.min(list, Math.round(midpoint / 10000) * 10000));
}
export function isBusinessOpen(
  hours: BusinessSettings['businessHours'],
  date = new Date(),
): boolean {
  if (!hours.enabled) return true;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: hours.timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  const rule = hours.days.find((d) => d.day === day);
  const time = `${get('hour')}:${get('minute')}`;
  return !!rule && !rule.closed && time >= rule.opens && time < rule.closes;
}
export function validateSettings(s: BusinessSettings): string | null {
  if (
    typeof s.businessName !== 'string' ||
    s.businessName.trim().length < 2 ||
    s.businessName.trim().length > 80
  )
    return 'Business name must contain 2 to 80 characters.';
  if (!['products', 'services', 'made-to-order', 'mixed'].includes(s.businessType))
    return 'Unknown business type.';
  if (!['friendly', 'professional', 'Pidgin-friendly'].includes(s.tone)) return 'Unknown tone.';
  if (typeof s.autoNegotiation !== 'boolean') return 'Auto-negotiation must be on or off.';
  if (!Array.isArray(s.autoIntents) || s.autoIntents.some((i) => !Object.hasOwn(intentLabels, i)))
    return 'This intent needs vendor approval.';
  if (
    !Array.isArray(s.replyLanguages) ||
    !s.replyLanguages.length ||
    s.replyLanguages.some((l) => !['en', 'pcm'].includes(l))
  )
    return 'Select English and/or Nigerian Pidgin.';
  if (
    !Array.isArray(s.deliveryFees) ||
    s.deliveryFees.some(
      (f) =>
        !['Lagos', 'Abuja', 'Ibadan'].includes(f.city) ||
        !Number.isSafeInteger(f.feeKobo) ||
        f.feeKobo < 0,
    )
  )
    return 'Delivery fees must be non-negative integer kobo.';
  const h = s.businessHours;
  if (
    !h ||
    h.timezone !== 'Africa/Lagos' ||
    typeof h.enabled !== 'boolean' ||
    typeof h.awayMessage !== 'string' ||
    !h.awayMessage.trim() ||
    h.awayMessage.length > 500 ||
    !Array.isArray(h.days) ||
    h.days.length !== 7 ||
    new Set(h.days.map((d) => d.day)).size !== 7 ||
    h.days.some(
      (d) =>
        !Number.isInteger(d.day) ||
        d.day < 0 ||
        d.day > 6 ||
        typeof d.closed !== 'boolean' ||
        ![d.opens, d.closes].every((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)) ||
        (!d.closed && d.opens >= d.closes),
    )
  )
    return 'Use seven unique days, valid same-day opening/closing times and an away message up to 500 characters.';
  const p = s.preferences;
  if (
    !p ||
    typeof p.lowData !== 'boolean' ||
    typeof p.darkMode !== 'boolean' ||
    !['en', 'pcm'].includes(p.language) ||
    typeof p.notifications?.readyToPay !== 'boolean' ||
    typeof p.notifications?.needsYou !== 'boolean'
  )
    return 'Invalid app preferences.';
  return null;
}
