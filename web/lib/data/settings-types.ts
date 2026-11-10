import type { Entity, ID, ISODate, Channel, Kobo } from './types';
export type AppLanguage = 'en' | 'pcm';
export interface Preferences {
  lowData: boolean;
  darkMode: boolean;
  language: AppLanguage;
  notifications: { readyToPay: boolean; needsYou: boolean };
}
export interface BusinessHours {
  enabled: boolean;
  timezone: 'Africa/Lagos';
  days: { day: number; closed: boolean; opens: string; closes: string }[];
  awayMessage: string;
}
export interface HelperLink {
  id: ID;
  code: string;
  expiresAt: ISODate;
  status: 'pending' | 'linked';
  helperNumber: string | null;
}
export interface ChannelAttempt {
  authorizationUrl?: string;
  id: ID;
  channel: Channel;
  expiresAt: ISODate;
  status: 'pending' | 'completed';
}
export interface AuditEntry extends Entity {
  actorName: string;
  action: string;
  subject: string;
  at: ISODate;
}
export interface BillingOffer {
  id: ID;
  name: string;
  kind: 'monthly' | 'yearly' | 'volume' | 'bundle';
  priceKobo: Kobo;
  conversations: number;
  description: string;
}
