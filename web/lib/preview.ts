import { authConfigured } from './supabase';

// Next.js replaces NODE_ENV at build time. No public flag can override this gate.
export function previewAllowed(): boolean {
  return process.env.NODE_ENV !== 'production' && !authConfigured();
}
