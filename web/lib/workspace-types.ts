import type { Profile } from './onboarding';
export type Tab = 'Inbox' | 'Orders' | 'Catalogue' | 'Insights' | 'Settings';
export type Vendor = Profile & { id: string };
export interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
