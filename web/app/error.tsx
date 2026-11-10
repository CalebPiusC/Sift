'use client';
import { Button } from '../components/ui/button';
export default function ErrorScreen({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto max-w-lg space-y-4 p-6">
      <h1 className="text-xl font-semibold">This screen couldn’t open.</h1>
      <p role="alert" className="text-sm leading-6 text-slate-500">
        Check your connection and try again. Reloading the page resets sample data.
      </p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
