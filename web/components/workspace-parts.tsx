import {
  Check,
  ChevronRight,
  Instagram,
  Facebook,
  Music2,
  Mail,
  MessageCircle,
} from 'lucide-react';

export function Choice({
  title,
  description,
  selected,
  onClick,
}: {
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`flex min-h-20 w-full items-center justify-between gap-3 rounded-xl border p-4 text-left transition ${selected ? 'border-primary bg-indigo-50 dark:bg-indigo-950' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'}`}
    >
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-1.5 block text-xs text-slate-500">{description}</span>
      </span>
      <span
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${selected ? 'border-primary bg-primary text-white' : 'border-slate-300'}`}
      >
        {selected && <Check size={12} />}
      </span>
    </button>
  );
}
export function ChannelIcon({ name }: { name: string }) {
  const Icon =
    name === 'Instagram'
      ? Instagram
      : name === 'Facebook'
        ? Facebook
        : name === 'TikTok'
          ? Music2
          : name === 'Email'
            ? Mail
            : MessageCircle;
  return <Icon size={17} aria-label={name} />;
}
export function SetupItem({
  title,
  text,
  done,
  onClick,
}: {
  title: string;
  text: string;
  done?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      disabled={done}
      onClick={onClick}
      className="flex min-h-20 w-full items-center gap-3 text-left"
    >
      <span
        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${done ? 'bg-green-50 text-success dark:bg-green-950' : 'border border-slate-200 dark:border-slate-700'}`}
      >
        {done ? <Check size={13} /> : <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />}
      </span>
      <span>
        <span
          className={`block text-xs font-semibold ${done ? 'text-slate-400' : 'text-slate-700 dark:text-slate-200'}`}
        >
          {title}
        </span>
        <span className="mt-1 block text-[10px] text-slate-400">{text}</span>
      </span>
      {!done && <ChevronRight className="ml-auto text-slate-400" size={14} />}
    </button>
  );
}
