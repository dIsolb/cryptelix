import { useEffect, useRef } from 'react';

/**
 * Cloudflare Turnstile widget (bot / brute-force mitigation).
 *
 * Config-driven: renders only when VITE_TURNSTILE_SITEKEY is set. In local dev
 * without a sitekey it renders nothing and TURNSTILE_ENABLED is false, so forms
 * work exactly as before. Use Cloudflare's test keys in dev to exercise the
 * real path without a real domain.
 */

const SITEKEY = (import.meta.env.VITE_TURNSTILE_SITEKEY as string | undefined)?.trim();
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

export const TURNSTILE_ENABLED = Boolean(SITEKEY);

interface TurnstileApi {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback?: (token: string) => void;
      'expired-callback'?: () => void;
      'error-callback'?: () => void;
      theme?: 'auto' | 'light' | 'dark';
    },
  ) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId?: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | null = null;

function ensureScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SCRIPT_SRC}"]`,
    );
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('turnstile load failed')));
      if (window.turnstile) resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('turnstile load failed'));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

interface TurnstileWidgetProps {
  /** Called with a fresh token once the challenge is solved. */
  onVerify: (token: string) => void;
  /** Called when the token expires or the widget errors (clear stored token). */
  onExpire?: () => void;
}

export function TurnstileWidget({ onVerify, onExpire }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!SITEKEY) return;
    let cancelled = false;

    ensureScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: SITEKEY,
          theme: 'dark',
          callback: (token: string) => onVerify(token),
          'expired-callback': () => onExpire?.(),
          'error-callback': () => onExpire?.(),
        });
      })
      .catch(() => {
        // Script blocked/unavailable — leave the form usable; backend decides
        // (fail-open) whether to enforce.
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* ignore */
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!SITEKEY) return null;

  return <div ref={containerRef} className="flex justify-center" />;
}
