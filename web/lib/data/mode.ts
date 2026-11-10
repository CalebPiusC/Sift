import type { DataMode } from './types';
/** Called by the server layout; only this non-secret enum crosses into the browser. */
export function parseDataMode(value: string | undefined): DataMode {
  if (value === undefined || value === '') return 'mock';
  if (value !== 'mock' && value !== 'api') throw new Error('DATA_MODE must be mock or api.');
  return value;
}
