'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from './ui/button';
import { ArrowRight } from 'lucide-react';
import { Choice, ChannelIcon } from './workspace-parts';
import { businessTypes, tones, validName, type Profile } from '../lib/onboarding';
interface Props {
  brand: ReactNode;
  themeButton: ReactNode;
  preview: boolean;
  step: number;
  profile: Profile;
  error: string;
  busy: boolean;
  setProfile: (p: Profile) => void;
  setStep: (s: number) => void;
  finish: () => Promise<void>;
}
export function OnboardingScreen({
  brand,
  themeButton,
  preview,
  step,
  profile,
  error,
  busy,
  setProfile,
  setStep,
  finish,
}: Props) {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    title.current?.focus();
  }, [step]);
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-7">
      <header className="flex items-center justify-between">
        {brand}
        {themeButton}
      </header>
      <div className="mx-auto my-auto w-full max-w-lg py-14">
        {preview && (
          <p className="mb-6 text-xs font-semibold text-warning">PREVIEW · Changes are not saved</p>
        )}
        <div className="mb-8 flex gap-2">
          {[0, 1, 2, 3].map((n) => (
            <div
              key={n}
              className={`h-1 flex-1 rounded-full ${n <= step ? 'bg-primary' : 'bg-slate-200 dark:bg-slate-800'}`}
            />
          ))}
        </div>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary dark:text-indigo-300">
          A LITTLE INTRODUCTION · {step + 1} OF 4
        </p>
        <h1 ref={title} tabIndex={-1} className="mb-3 mt-4 text-3xl font-bold tracking-tight">
          {
            [
              'What’s your business called?',
              'What do you bring to the world?',
              'What’s your business’s vibe?',
              'Your customers. All together.',
            ][step]
          }
        </h1>
        <p className="mb-8 text-sm leading-6 text-slate-500">
          {
            [
              'Let’s put a name to the dream. You can change this later.',
              'We’ll shape your workspace around the way you work.',
              'Your assistant should sound like you. Pick your natural style.',
              'WhatsApp, Instagram, Facebook, TikTok and email — one inbox. Connect your own accounts later in Settings. TikTok availability is being confirmed.',
            ][step]
          }
        </p>
        {step === 0 && (
          <label className="text-sm font-medium">
            Business name
            <input
              autoFocus
              className="mt-2"
              placeholder="e.g. Adire by Tola"
              maxLength={80}
              value={profile.business_name}
              onChange={(e) => setProfile({ ...profile, business_name: e.target.value })}
            />
          </label>
        )}
        {step === 1 && (
          <div className="space-y-3">
            {businessTypes.map((type, i) => (
              <Choice
                key={type}
                selected={profile.business_type === type}
                onClick={() => setProfile({ ...profile, business_type: type })}
                title={['Products', 'Services', 'Made-to-order', 'A little of everything'][i]}
                description={
                  [
                    'Ready-to-sell items, with stock to keep track of',
                    'Your skills, expertise and time',
                    'Custom pieces, made just for your customer',
                    'A mix of products, services or custom orders',
                  ][i]
                }
              />
            ))}
          </div>
        )}
        {step === 2 && (
          <div className="space-y-3">
            {tones.map((tone, i) => (
              <Choice
                key={tone}
                selected={profile.tone === tone}
                onClick={() => setProfile({ ...profile, tone })}
                title={['Warm & friendly', 'Polished & professional', 'Pidgin-friendly'][i]}
                description={
                  [
                    '“Hi there! So happy you stopped by.”',
                    '“Welcome. How may we assist you today?”',
                    '“How far! Wetin you dey look for today?”',
                  ][i]
                }
              />
            ))}
          </div>
        )}
        {step === 3 && (
          <div className="space-y-3">
            {['WhatsApp', 'Instagram', 'Facebook', 'TikTok', 'Email'].map((name) => (
              <div
                key={name}
                className="flex items-center justify-between rounded-xl border border-slate-200 p-4 dark:border-slate-800"
              >
                <span className="flex items-center gap-3 text-sm font-medium">
                  <ChannelIcon name={name} />
                  {name}
                </span>
                <span className="text-xs text-slate-400">Connect later</span>
              </div>
            ))}
          </div>
        )}
        {error && (
          <p role="alert" className="mt-4 text-sm text-danger">
            {error}
          </p>
        )}
        <div className="mt-8 flex items-center gap-3">
          {step > 0 && (
            <Button variant="ghost" disabled={busy} onClick={() => setStep(step - 1)}>
              Back
            </Button>
          )}
          <Button
            className="flex-1"
            disabled={busy || (step === 0 && !validName(profile.business_name))}
            onClick={() => (step < 3 ? setStep(step + 1) : void finish())}
          >
            {busy ? 'Setting things up…' : step === 3 ? 'Let’s get you settled' : 'Continue'}
            <ArrowRight size={17} />
          </Button>
        </div>
        <p className="mt-5 text-center text-xs text-slate-400">
          {step === 3
            ? 'Skip for now. Connect your channels when you’re ready.'
            : 'No long forms. Just getting to know you.'}
        </p>
      </div>
    </main>
  );
}
