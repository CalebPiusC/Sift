import { categories } from './catalogue-types';
import type { CatalogueData } from './contract';
import type { Product, Result, Page, ID, DataEvent } from './types';
import type { ListInput } from './types';
import {
  applyText,
  fakeExtract,
  parseUpdate,
  stockBadge,
  validateProduct,
  type TextChange,
} from './catalogue-logic';
type Run = <T>(area: DataEvent['area'], work: () => Result<T>) => Promise<Result<T>>;
const ok = <T>(data: T): Result<T> => ({ ok: true, data: structuredClone(data) });
const fail = (code: 'VALIDATION' | 'NOT_FOUND' | 'CONFLICT', message: string): Result<never> => ({
  ok: false,
  error: { code, message, retryable: false },
});
export function catalogueMock(options: {
  products: Product[];
  vendorId: ID;
  id: (prefix: string) => ID;
  run: Run;
  emit: (area: DataEvent['area'], id: ID, type?: DataEvent['type']) => void;
  page: <T>(rows: T[], input?: ListInput) => Result<Page<T>>;
}): CatalogueData {
  const { products, vendorId, id, run, emit, page } = options;
  const batches = new Map<string, { fingerprint: string; ids: string[] }>();
  const proposals = new Map<string, { change: TextChange; candidates: Product[] }>();
  return {
    list: (input) =>
      run('catalogue', () =>
        page(
          products.filter(
            (p) =>
              p.archived === (input?.archived ?? false) &&
              (!input?.category || p.category === input.category) &&
              (!input?.stock || stockBadge(p) === input.stock) &&
              (!input?.search ||
                `${p.name} ${p.category}`.toLowerCase().includes(input.search.toLowerCase())),
          ),
          input,
        ),
      ),
    get: (key) =>
      run('catalogue', () => {
        const p = products.find((p) => p.id === key);
        return p ? ok(p) : fail('NOT_FOUND', 'Product not found.');
      }),
    extract: (input) =>
      run('catalogue', () => {
        if (!categories.includes(input.category))
          return fail('VALIDATION', 'Tap an available category.');
        if (!input.photos.length || input.photos.length > 10)
          return fail('VALIDATION', 'Choose 1–10 photos.');
        const drafts = (input.bulk ? input.photos : [input.photos[0]]).map((photo, i) => {
          const product = fakeExtract(input.category, i);
          product.photos = input.bulk ? [photo] : input.photos;
          return { key: id('draft'), product };
        });
        return ok(drafts);
      }),
    createMany: (input) =>
      run('catalogue', () => {
        if (!input.requestId || !input.products.length || input.products.length > 10)
          return fail('VALIDATION', 'Confirm between 1 and 10 items.');
        const fingerprint = JSON.stringify(input.products);
        const saved = batches.get(input.requestId);
        if (saved)
          return saved.fingerprint === fingerprint
            ? ok(saved.ids.map((key) => products.find((p) => p.id === key)!))
            : fail('CONFLICT', 'This confirmation has already been used.');
        for (const p of input.products) {
          if (!p.photos.length) return fail('VALIDATION', 'Each new item needs a photo.');
          const error = validateProduct(p);
          if (error) return fail('VALIDATION', `${p.name || 'Item'}: ${error}`);
        }
        const created = input.products.map((p) => ({
          ...structuredClone(p),
          id: id('product'),
          vendorId,
          archived: false,
          revision: 1,
        }));
        products.push(...created);
        batches.set(input.requestId, { fingerprint, ids: created.map((p) => p.id) });
        for (const p of created) emit('catalogue', p.id, 'created');
        return ok(created);
      }),
    update: (input) =>
      run('catalogue', () => {
        const p = products.find((p) => p.id === input.id);
        if (!p) return fail('NOT_FOUND', 'Product not found.');
        if (p.revision !== input.expectedRevision)
          return fail('CONFLICT', 'This item changed. Reopen it before editing.');
        const error = validateProduct(input.product);
        if (error) return fail('VALIDATION', error);
        const next = {
          ...structuredClone(input.product),
          id: p.id,
          vendorId,
          archived: p.archived,
          revision: p.revision + 1,
        };
        products[products.indexOf(p)] = next;
        emit('catalogue', p.id);
        return ok(next);
      }),
    archive: (input) =>
      run('catalogue', () => {
        const p = products.find((p) => p.id === input.id);
        if (!p) return fail('NOT_FOUND', 'Product not found.');
        if (p.revision !== input.expectedRevision)
          return fail('CONFLICT', 'This item changed. Reopen it first.');
        p.archived = input.archived;
        p.revision++;
        emit('catalogue', p.id);
        return ok(p);
      }),
    proposeText: (input) =>
      run('catalogue', () => {
        const parsed = parseUpdate(input.text);
        if (!parsed.ok) return parsed;
        const { query, change } = parsed.data;
        const words = query.split(/\s+/);
        const candidates = products.filter(
          (p) => !p.archived && words.every((w) => p.name.toLowerCase().includes(w)),
        );
        if (!candidates.length)
          return fail('NOT_FOUND', 'No matching item. Try a more specific product name.');
        const proposalId = id('proposal');
        proposals.set(proposalId, { change, candidates: structuredClone(candidates) });
        return ok({
          id: proposalId,
          text: input.text,
          candidates: candidates.map((p) => ({
            id: p.id,
            name: p.name,
            summary:
              change.kind === 'stock'
                ? `Set ${p.name} stock to ${change.value}${p.variants.length && change.value === 0 ? ' and mark every variant out of stock' : ''}.`
                : `Set ${p.name} price${p.variants.length ? ' and every variant price' : ''} to ₦${(change.value / 100).toLocaleString('en-NG')}. Lowest price stays unchanged.`,
          })),
        });
      }),
    confirmText: (input) =>
      run('catalogue', () => {
        const proposal = proposals.get(input.proposalId);
        const before = proposal?.candidates.find((p) => p.id === input.productId);
        if (!proposal || !before) return fail('NOT_FOUND', 'Choose an item from this proposal.');
        const p = products.find((p) => p.id === input.productId);
        if (!p || p.archived || p.revision !== before.revision)
          return fail('CONFLICT', 'This item changed. Review a fresh suggestion.');
        if (proposal.change.kind === 'stock' && p.stock === null)
          return fail(
            'VALIDATION',
            'Stock is not tracked for this item. Use the detail card to change tracking.',
          );
        let next: Product;
        try {
          next = applyText(p, proposal.change);
        } catch {
          return fail('VALIDATION', 'Choose stock for each variant on the product detail card.');
        }
        const error = validateProduct(next);
        if (error) return fail('VALIDATION', error);
        next.revision++;
        products[products.indexOf(p)] = next;
        proposals.delete(input.proposalId);
        emit('catalogue', p.id);
        return ok(next);
      }),
  };
}
