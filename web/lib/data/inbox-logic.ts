import type { Channel, Conversation, LeadStage, ApprovalReason } from './types';
export const stages: Record<LeadStage, string> = {
  new: 'New',
  interested: 'Interested',
  ready_to_pay: 'Ready to pay',
  paid: 'Paid',
  cold: 'Cold',
};
export const channelLabels: Record<Channel, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  email: 'Email',
};
export const reasons: Record<ApprovalReason, string> = {
  discount_below_floor: 'The requested discount is below your lowest price.',
  bulk_order: 'Bulk quantities need your pricing and fulfilment decision.',
  complaint: 'A complaint needs a personal response.',
  refund: 'Refunds always need your decision.',
  low_confidence: 'The AI is less than 75% confident.',
  unknown_intent: 'The request is not covered by an automatic reply.',
  unverified_facts: 'The reply contains facts that could not be verified.',
};
export const humanMode = (c: Conversation, now = Date.now()) =>
  !!c.humanModeUntil && Date.parse(c.humanModeUntil) > now;
const appLinks: Record<Channel, string> = {
  whatsapp: 'https://web.whatsapp.com/',
  instagram: 'https://www.instagram.com/direct/inbox/',
  facebook: 'https://www.facebook.com/messages/',
  tiktok: 'https://www.tiktok.com/messages',
  email: 'mailto:',
};
// Never trust a remote javascript: URL or a link to an unrelated host.
export function channelLink(c: Conversation): { url: string; exact: boolean } {
  if (c.threadUrl) {
    try {
      const u = new URL(c.threadUrl);
      const hosts: Record<Channel, string[]> = {
        whatsapp: ['wa.me', 'web.whatsapp.com'],
        instagram: ['www.instagram.com', 'instagram.com'],
        facebook: ['www.facebook.com', 'm.me'],
        tiktok: ['www.tiktok.com'],
        email: [],
      };
      if (
        (c.channel === 'email' && u.protocol === 'mailto:') ||
        (u.protocol === 'https:' && hosts[c.channel].includes(u.hostname))
      )
        return { url: u.href, exact: true };
    } catch {}
  }
  return { url: appLinks[c.channel], exact: false };
}
