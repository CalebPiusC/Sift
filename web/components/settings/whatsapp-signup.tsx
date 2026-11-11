'use client';
import { useEffect, useRef, useState } from 'react';
import type { ChannelAttempt } from '../../lib/data';
import { useDataClient } from '../data/provider';
import { Button } from '../ui/button';

type Facebook = {
  init(options: object): void;
  login(callback: (response: { authResponse?: { code?: string } }) => void, options: object): void;
};

export function WhatsAppSignup({
  attempt,
  onConnected,
}: {
  attempt: ChannelAttempt;
  onConnected: () => void;
}) {
  const { client } = useDataClient();
  const [ready, setReady] = useState(Boolean(attempt.sandbox));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const details = useRef<{ phoneNumberId?: string; wabaId?: string; code?: string }>({});
  const active = useRef(true);
  const submitted = useRef(false);
  const finish = useRef<() => void>(() => {});
  finish.current = () => {
    const data = details.current;
    if (
      submitted.current ||
      !client.channels.completeWhatsApp ||
      (!attempt.sandbox && (!data.code || !data.phoneNumberId || !data.wabaId))
    )
      return;
    submitted.current = true;
    void client.channels.completeWhatsApp({ attemptId: attempt.id, ...data }).then((result) => {
      if (!active.current) return;
      setBusy(false);
      if (result.ok) onConnected();
      else {
        submitted.current = false;
        setError(result.error.message);
      }
    });
  };
  useEffect(() => {
    active.current = true;
    const config = attempt.embeddedSignup;
    if (!config)
      return () => {
        active.current = false;
      };
    let timer: ReturnType<typeof setInterval>;
    const receive = (event: MessageEvent) => {
      if (
        !['https://www.facebook.com', 'https://web.facebook.com'].includes(event.origin) ||
        !active.current
      )
        return;
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data?.type !== 'WA_EMBEDDED_SIGNUP') return;
        if (
          data.event === 'FINISH' &&
          /^\d+$/.test(data.data?.phone_number_id) &&
          /^\d+$/.test(data.data?.waba_id)
        ) {
          details.current = {
            ...details.current,
            phoneNumberId: data.data.phone_number_id,
            wabaId: data.data.waba_id,
          };
          finish.current();
        } else if (['CANCEL', 'ERROR'].includes(data.event)) {
          setBusy(false);
          setError('WhatsApp signup was not completed. Nothing was connected.');
        }
      } catch {
        /* Ignore unrelated cross-origin messages. */
      }
    };
    window.addEventListener('message', receive);
    const initialize = () => {
      const fb = (window as Window & { FB?: Facebook }).FB;
      if (!fb) return;
      fb.init({
        appId: config.appId,
        version: config.version,
        xfbml: false,
        autoLogAppEvents: false,
      });
      setReady(true);
      clearInterval(timer);
    };
    if (!document.getElementById('meta-business-sdk')) {
      const script = document.createElement('script');
      script.id = 'meta-business-sdk';
      script.src = 'https://connect.facebook.net/en_US/sdk.js';
      script.async = true;
      script.onerror = () => {
        if (active.current) setError('Meta signup could not load. Retry later.');
      };
      document.head.appendChild(script);
    }
    timer = setInterval(initialize, 100);
    initialize();
    return () => {
      active.current = false;
      clearInterval(timer);
      window.removeEventListener('message', receive);
    };
  }, [attempt.embeddedSignup]);
  return (
    <div className="my-4 space-y-3">
      <p className="text-sm leading-6">
        {attempt.sandbox
          ? 'Sandbox: no Meta account or real number is connected, and no WhatsApp message is sent.'
          : 'Connect your own WhatsApp Business number using Meta Embedded Signup. Selvora never asks for your Facebook password.'}
      </p>
      <Button
        disabled={!ready || busy}
        onClick={() => {
          setBusy(true);
          setError('');
          if (attempt.sandbox) {
            finish.current();
            return;
          }
          const fb = (window as Window & { FB?: Facebook }).FB;
          fb?.login(
            (response) => {
              if (!active.current) return;
              if (!response.authResponse?.code) {
                setBusy(false);
                setError('Meta did not authorize the connection.');
                return;
              }
              details.current = { ...details.current, code: response.authResponse.code };
              finish.current();
            },
            {
              config_id: attempt.embeddedSignup?.configId,
              response_type: 'code',
              override_default_response_type: true,
              extras: { setup: {}, sessionInfoVersion: '3' },
            },
          );
        }}
      >
        {busy
          ? 'Connecting WhatsApp…'
          : attempt.sandbox
            ? 'Connect sandbox WhatsApp'
            : 'Continue with Meta'}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
