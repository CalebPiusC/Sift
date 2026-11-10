import type { Preferences } from './settings-types';
export const defaultPreferences: Preferences = {
  lowData: false,
  darkMode: false,
  language: 'en',
  notifications: { readyToPay: true, needsYou: true },
};
