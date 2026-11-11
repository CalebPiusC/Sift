import { MessageCircle, Instagram, Facebook, Music2, Mail } from 'lucide-react';
import type { Channel } from '../../lib/data';
import { channelLabels } from '../../lib/data/inbox-logic';
const icons = {
  whatsapp: MessageCircle,
  instagram: Instagram,
  facebook: Facebook,
  tiktok: Music2,
  email: Mail,
};
export function ChannelIcon({ channel }: { channel: Channel }) {
  const Icon = icons[channel];
  return (
    <span
      role="img"
      title={channelLabels[channel]}
      aria-label={channelLabels[channel]}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-primary dark:bg-indigo-950 dark:text-indigo-300"
    >
      <Icon size={18} aria-hidden="true" />
    </span>
  );
}
