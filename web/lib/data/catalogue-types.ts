import type { Product, ID, Result } from './types';
export const categories = [
  'Fashion',
  'Shoes',
  'Beauty',
  'Food & drink',
  'Home',
  'Accessories',
  'Services',
  'Custom',
] as const;
export type Category = (typeof categories)[number];
export type StockFilter = 'in_stock' | 'low' | 'out' | 'not_tracked';
export interface ProductPhoto {
  id: ID;
  url: string;
  name: string;
}
export interface ProductDetails {
  sizes: string[];
  portion: string;
  prepMinutes: number | null;
  durationMinutes: number | null;
}
export type ProductInput = Omit<Product, 'id' | 'vendorId' | 'archived' | 'revision'>;
export interface ExtractionInput {
  photos: ProductPhoto[];
  category: Category;
  bulk: boolean;
}
export interface CatalogueDraft {
  key: ID;
  product: ProductInput;
}
export interface CreateProductsInput {
  requestId: ID;
  products: ProductInput[];
}
export interface EditProductInput {
  id: ID;
  expectedRevision: number;
  product: ProductInput;
}
export interface TypedProposal {
  id: ID;
  text: string;
  candidates: { id: ID; name: string; summary: string }[];
}
export interface CatalogueMutations {
  extract(input: ExtractionInput): Promise<Result<CatalogueDraft[]>>;
  createMany(input: CreateProductsInput): Promise<Result<Product[]>>;
  update(input: EditProductInput): Promise<Result<Product>>;
  archive(input: { id: ID; expectedRevision: number; archived: boolean }): Promise<Result<Product>>;
  proposeText(input: { text: string }): Promise<Result<TypedProposal>>;
  confirmText(input: { proposalId: ID; productId: ID }): Promise<Result<Product>>;
}
