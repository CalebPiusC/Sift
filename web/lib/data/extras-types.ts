import type { Entity, ISODate, Result, Insights } from './types';
export interface DateRange {
  from: string;
  to: string;
}
export interface InsightsReport extends Insights {
  responseSeconds: number | null;
  responseSamples: number;
  stages: { label: string; value: number }[];
  topProducts: { label: string; value: number }[];
  hours: { label: string; value: number }[];
  handling: { label: string; value: number }[];
}
export interface FollowupSettings {
  enabled: boolean;
  afterHours: number;
  style: 'friendly' | 'professional' | 'Pidgin-friendly';
}
export interface Followup extends Entity {
  customerName: string;
  conversationId: string;
  scheduledAt: ISODate;
  sentAt: ISODate | null;
  status: 'scheduled' | 'sent' | 'cancelled';
  text: string;
}
export interface FlaggedMessage extends Entity {
  customerName: string;
  channel: string;
  text: string;
  reason: string;
  createdAt: ISODate;
  status: 'flagged' | 'cleared' | 'blocked';
}
export interface RestockAlert extends Entity {
  productId: string;
  productName: string;
  customerName: string;
  createdAt: ISODate;
  status: 'waiting' | 'notified';
}
export interface ExtrasSnapshot {
  followupSettings: FollowupSettings;
  followups: Followup[];
  flags: FlaggedMessage[];
  restock: RestockAlert[];
}
export interface ExtrasData {
  get(): Promise<Result<ExtrasSnapshot>>;
  configure(input: FollowupSettings): Promise<Result<FollowupSettings>>;
  followup(input: { id: string; action: 'cancel' | 'simulate_send' }): Promise<Result<Followup>>;
  moderate(input: { id: string; action: 'not_spam' | 'block' }): Promise<Result<FlaggedMessage>>;
  notifyRestock(input: { id: string }): Promise<Result<RestockAlert>>;
}
