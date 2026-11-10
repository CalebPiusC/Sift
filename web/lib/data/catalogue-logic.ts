import type { Product, Result } from './types';
import { categories, type ProductInput, type StockFilter, type Category } from './catalogue-types';
export function money(text: string): number | null {
  const match = text
    .trim()
    .match(/^(?:₦|N)?\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)\s*(k)?$/i);
  if (!match) return null;
  const value = Math.round(Number(match[1].replaceAll(',', '')) * (match[2] ? 100000 : 100));
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}
export function stockBadge(p: Pick<Product, 'stock' | 'lowStockThreshold'>): StockFilter {
  return p.stock === null
    ? 'not_tracked'
    : p.stock === 0
      ? 'out'
      : p.stock <= p.lowStockThreshold
        ? 'low'
        : 'in_stock';
}
export const stockLabels: Record<StockFilter, string> = {
  in_stock: 'In stock',
  low: 'Low',
  out: 'Out of stock',
  not_tracked: 'Not tracked',
};
export function validateProduct(p: ProductInput): string | null {
  if (!p.name.trim() || p.name.length > 100) return 'Give this item a name of 1–100 characters.';
  if (!categories.includes(p.category)) return 'Tap one of the available categories.';
  if (!['product', 'service', 'made-to-order'].includes(p.kind)) return 'Choose a valid item type.';
  if (
    !Number.isSafeInteger(p.priceKobo) ||
    p.priceKobo <= 0 ||
    !Number.isSafeInteger(p.lowestPriceKobo) ||
    p.lowestPriceKobo < 0 ||
    p.lowestPriceKobo > p.priceKobo
  )
    return 'Set a positive price and a lowest price no higher than that price.';
  if (!Number.isSafeInteger(p.lowStockThreshold) || p.lowStockThreshold < 0)
    return 'Low-stock threshold must be a whole number of zero or more.';
  if (p.stock !== null && (!Number.isSafeInteger(p.stock) || p.stock < 0))
    return 'Stock must be a whole number of zero or more.';
  if (
    p.variants.some(
      (v) =>
        !v.name.trim() ||
        !Number.isSafeInteger(v.priceKobo) ||
        v.priceKobo < p.lowestPriceKobo ||
        (v.stock !== null && (!Number.isSafeInteger(v.stock) || v.stock < 0)),
    )
  )
    return 'Check each variant name, price and stock. Variant prices cannot be below the lowest price.';
  if (new Set(p.variants.map((v) => v.id)).size !== p.variants.length)
    return 'Variants must have distinct IDs.';
  if (p.variants.length) {
    if (p.variants.some((v) => (v.stock === null) !== (p.stock === null)))
      return 'Track stock for all variants or none.';
    if (p.stock !== null && p.stock !== p.variants.reduce((n, v) => n + (v.stock ?? 0), 0))
      return 'Total stock must equal variant stock.';
  }
  if (
    p.photos.length > 10 ||
    p.photos.some(
      (photo) =>
        !photo.id ||
        !photo.name ||
        (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(photo.url) &&
          !/^https:\/\//.test(photo.url)),
    )
  )
    return 'Use up to 10 JPG, PNG or WebP photos.';
  if (p.category === 'Shoes' && !p.details.sizes.length) return 'Tap at least one shoe size.';
  if (
    p.category === 'Food & drink' &&
    (!p.details.portion.trim() ||
      !Number.isSafeInteger(p.details.prepMinutes) ||
      p.details.prepMinutes! <= 0)
  )
    return 'Add a portion and preparation time in minutes.';
  if (
    (p.category === 'Services' || p.kind === 'service') &&
    (!Number.isSafeInteger(p.details.durationMinutes) || p.details.durationMinutes! <= 0)
  )
    return 'Add the service duration in minutes.';
  return null;
}
export function fakeExtract(category: Category, index: number): ProductInput {
  const names: Record<Category, string[]> = {
    Fashion: ['Indigo Adire Set', 'Ankara Wrap Dress'],
    Shoes: ['Black Sneakers', 'White Sneakers'],
    Beauty: ['Shea Body Butter', 'Hibiscus Hair Oil'],
    'Food & drink': ['Jollof Rice Bowl', 'Small Chops Box'],
    Home: ['Woven Basket', 'Scented Candle'],
    Accessories: ['Beaded Bag', 'Leather Bag'],
    Services: ['Personal Styling Session', 'Makeup Session'],
    Custom: ['Bespoke Outfit', 'Custom Gift Box'],
  };
  return {
    name: names[category][index % 2],
    category,
    description: 'Please review these sample details before confirming.',
    kind: category === 'Services' ? 'service' : category === 'Custom' ? 'made-to-order' : 'product',
    priceKobo: 0,
    lowestPriceKobo: 0,
    stock: category === 'Services' || category === 'Custom' ? null : 1,
    lowStockThreshold: 3,
    variants: [],
    photos: [],
    details: { sizes: [], portion: '', prepMinutes: null, durationMinutes: null },
  };
}
export type TextChange = { kind: 'stock'; value: number } | { kind: 'price'; value: number };
export function parseUpdate(text: string): Result<{ query: string; change: TextChange }> {
  let query = '';
  let change: TextChange | undefined;
  const price = text.trim().match(/^(?:raise|set|change|update)\s+(.+?)\s+price\s+to\s+(.+)$/i);
  const finished = text.trim().match(/^(.+?)\s+(?:finished|sold out|out of stock)$/i);
  const stock = text.trim().match(/^(?:set|update)\s+(.+?)\s+stock\s+to\s+(\d+)$/i);
  if (price) {
    const amount = money(price[2]);
    if (amount !== null && amount > 0) {
      query = price[1];
      change = { kind: 'price', value: amount };
    }
  } else if (finished) {
    query = finished[1];
    change = { kind: 'stock', value: 0 };
  } else if (stock) {
    query = stock[1];
    const amount = Number(stock[2]);
    if (Number.isSafeInteger(amount)) change = { kind: 'stock', value: amount };
  }
  if (!change || !query.trim())
    return {
      ok: false,
      error: {
        code: 'VALIDATION',
        message:
          'Try “black sneakers finished”, “set sneakers stock to 8” or “raise bag price to 20k”.',
        retryable: false,
      },
    };
  return { ok: true, data: { query: query.toLowerCase(), change } };
}
export function applyText(p: Product, change: TextChange): Product {
  const next = structuredClone(p);
  if (change.kind === 'price') {
    next.priceKobo = change.value;
    next.variants = next.variants.map((v) => ({ ...v, priceKobo: change.value }));
  } else {
    next.stock = change.value;
    if (next.variants.length) {
      if (change.value === 0) next.variants = next.variants.map((v) => ({ ...v, stock: 0 }));
      else throw new Error('Edit individual variant stock on the product card.');
    }
  }
  return next;
}
