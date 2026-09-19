import { useState, useRef, useEffect, FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { CryptelixLogo } from '../CryptelixLogo';
import { isValidEmail, type AuthSession } from '../../lib/authStorage';
import { apiFetch } from '../../lib/apiClient';
import { TurnstileWidget, TURNSTILE_ENABLED } from './TurnstileWidget';

type AuthStep = 'email' | 'password';
type AuthMode = 'needs_activation' | 'needs_login';

interface LoginScreenProps {
  onSuccess: (session: AuthSession) => void;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  user: { id: number; email: string; username?: string | null };
}

export function LoginScreen({ onSuccess }: LoginScreenProps) {
  const [step, setStep] = useState<AuthStep>('email');
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  // Bump to force a fresh Turnstile challenge (tokens are single-use).
  const [turnstileNonce, setTurnstileNonce] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const resetTurnstile = () => {
    setTurnstileToken('');
    setTurnstileNonce((n) => n + 1);
  };

  useEffect(() => {
    inputRef.current?.focus();
  }, [step]);

  // Prefill the invite code from the activation link (e.g. ?invite=CODE).
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('invite');
    if (code) setInviteCode(code.trim());
  }, []);

  const resetPasswordFields = () => {
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    resetTurnstile();
  };

  const handleEmailStep = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = email.trim();

    if (!isValidEmail(trimmed)) {
      setError('Enter a valid email address.');
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      const res = await apiFetch('/api/v1/auth/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });

      if (res.status === 404) {
        setError('This email is not invited.');
        return;
      }

      if (res.status === 429) {
        setError('Too many attempts. Please wait a minute and try again.');
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((body as { detail?: string }).detail || 'Could not verify email.');
        return;
      }

      const data = (await res.json()) as { status: AuthMode; email: string };
      setAuthMode(data.status);
      setEmail(data.email);
      resetPasswordFields();
      setStep('password');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasswordStep = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedPassword = password.trim();

    if (!trimmedPassword) {
      setError('Enter your password.');
      return;
    }

    if (authMode === 'needs_activation') {
      if (!inviteCode.trim()) {
        setError('Enter your invite code.');
        return;
      }
      if (trimmedPassword.length < 8) {
        setError('Password must be at least 8 characters.');
        return;
      }
      if (trimmedPassword !== confirmPassword.trim()) {
        setError('Passwords do not match.');
        return;
      }
    }

    if (TURNSTILE_ENABLED && !turnstileToken) {
      setError('Please complete the verification below.');
      return;
    }

    setError('');
    setIsSubmitting(true);

    const endpoint =
      authMode === 'needs_activation' ? '/api/v1/auth/activate' : '/api/v1/auth/login';

    const payload =
      authMode === 'needs_activation'
        ? {
            email: email.trim(),
            password: trimmedPassword,
            invite_code: inviteCode.trim(),
            turnstile_token: turnstileToken || undefined,
          }
        : {
            email: email.trim(),
            password: trimmedPassword,
            turnstile_token: turnstileToken || undefined,
          };

    try {
      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.status === 429) {
        setError('Too many attempts. Please wait a minute and try again.');
        resetTurnstile();
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const detail = (body as { detail?: string }).detail;
        setError(
          detail ||
            (authMode === 'needs_activation'
              ? 'Could not activate account.'
              : 'Invalid email or password.')
        );
        resetTurnstile();
        return;
      }

      const data = (await res.json()) as TokenResponse;
      onSuccess({
        accessToken: data.access_token,
        user: {
          id: data.user.id,
          email: data.user.email,
          username: data.user.username ?? null,
          signedInAt: new Date().toISOString(),
        },
      });
    } catch {
      setError('Network error. Please try again.');
      resetTurnstile();
    } finally {
      setIsSubmitting(false);
    }
  };

  const goBackToEmail = () => {
    setStep('email');
    setAuthMode(null);
    resetPasswordFields();
    setError('');
  };

  const isActivate = authMode === 'needs_activation';
  const passwordReady =
    password.trim().length > 0 &&
    (isActivate
      ? confirmPassword.trim().length > 0 && inviteCode.trim().length > 0
      : true);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-950 px-4">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundColor: '#09090b',
          backgroundImage: `
            radial-gradient(circle, rgba(250, 204, 21, 0.07) 1px, transparent 1px),
            linear-gradient(rgba(250, 204, 21, 0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(250, 204, 21, 0.02) 1px, transparent 1px)
          `,
          backgroundSize: '24px 24px, 48px 48px, 48px 48px',
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-yellow-500/5 via-transparent to-transparent" />

      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-[460px]"
      >
        <div className="mb-16 flex flex-col items-center text-center">
          <CryptelixLogo
            variant="wordmark"
            showAlpha={false}
            className="h-16 w-auto select-none object-contain object-center sm:h-[4.5rem]"
          />
          <h1 className="mt-3 text-[2.15rem] font-bold leading-[1.1] tracking-tight text-white sm:text-5xl">
            Join your own
          </h1>
          <p className="mt-1.5 text-[2.15rem] font-bold leading-[1.1] tracking-tight text-yellow-400 sm:text-5xl">
            Analytical Workspace
          </p>
        </div>

        <div className="rounded-3xl border border-zinc-800/90 bg-zinc-900/90 p-8 shadow-2xl shadow-black/50 backdrop-blur-sm sm:p-9">
          <div className="mb-7 text-center">
            <h2 className="text-[28px] font-bold tracking-tight text-white">Sign In</h2>
            <p className="mt-3 text-sm text-zinc-400">
              {step === 'email'
                ? 'Enter your invited email to continue.'
                : isActivate
                  ? 'Create your password to finish setup.'
                  : 'Enter your password to sign in.'}
            </p>
          </div>

          {step === 'email' ? (
            <form onSubmit={handleEmailStep} className="space-y-4">
              <div>
                <label htmlFor="login-email" className="mb-1.5 block text-xs font-medium text-zinc-400">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <input
                    ref={inputRef}
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (error) setError('');
                    }}
                    disabled={isSubmitting}
                    className="h-11 w-full rounded-lg border border-zinc-700 bg-zinc-950 pl-10 pr-3 text-sm text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-yellow-500/50 focus:ring-2 focus:ring-yellow-500/15 disabled:opacity-60"
                  />
                </div>
              </div>

              {error && <p className="text-xs text-red-400">{error}</p>}

              <motion.button
                type="submit"
                disabled={isSubmitting || !email.trim()}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-yellow-500 text-sm font-semibold text-black transition-colors hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-50"
                whileHover={isSubmitting ? undefined : { scale: 1.01 }}
                whileTap={isSubmitting ? undefined : { scale: 0.98 }}
              >
                {isSubmitting ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/20 border-t-black" />
                    Checking…
                  </span>
                ) : (
                  <>
                    Continue
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </motion.button>
            </form>
          ) : (
            <form onSubmit={handlePasswordStep} className="space-y-4">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-400">
                <span className="min-w-0 truncate">{email}</span>
                <button
                  type="button"
                  onClick={goBackToEmail}
                  className="shrink-0 text-[11px] font-medium text-yellow-500/90 hover:text-yellow-400"
                >
                  Change
                </button>
              </div>

              {isActivate && (
                <div>
                  <label htmlFor="login-invite-code" className="mb-1.5 block text-xs font-medium text-zinc-400">
                    Invite code
                  </label>
                  <input
                    id="login-invite-code"
                    type="text"
                    autoComplete="off"
                    placeholder="Code from your invitation"
                    value={inviteCode}
                    onChange={(e) => {
                      setInviteCode(e.target.value);
                      if (error) setError('');
                    }}
                    disabled={isSubmitting}
                    className="h-11 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-yellow-500/50 focus:ring-2 focus:ring-yellow-500/15 disabled:opacity-60"
                  />
                </div>
              )}

              <div>
                <label htmlFor="login-password" className="mb-1.5 block text-xs font-medium text-zinc-400">
                  {isActivate ? 'Create password' : 'Password'}
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <input
                    ref={inputRef}
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={isActivate ? 'new-password' : 'current-password'}
                    placeholder={isActivate ? 'At least 8 characters' : 'Enter your password'}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) setError('');
                    }}
                    disabled={isSubmitting}
                    className="h-11 w-full rounded-lg border border-zinc-700 bg-zinc-950 pl-10 pr-11 text-sm text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-yellow-500/50 focus:ring-2 focus:ring-yellow-500/15 disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    disabled={isSubmitting}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-50"
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </AnimatePresence>
                  </button>
                </div>
              </div>

              {isActivate && (
                <div>
                  <label
                    htmlFor="login-confirm-password"
                    className="mb-1.5 block text-xs font-medium text-zinc-400"
                  >
                    Confirm password
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                    <input
                      id="login-confirm-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="Repeat your password"
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        if (error) setError('');
                      }}
                      disabled={isSubmitting}
                      className="h-11 w-full rounded-lg border border-zinc-700 bg-zinc-950 pl-10 pr-3 text-sm text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-yellow-500/50 focus:ring-2 focus:ring-yellow-500/15 disabled:opacity-60"
                    />
                  </div>
                </div>
              )}

              {TURNSTILE_ENABLED && (
                <TurnstileWidget
                  key={turnstileNonce}
                  onVerify={(token) => setTurnstileToken(token)}
                  onExpire={() => setTurnstileToken('')}
                />
              )}

              {error && <p className="text-xs text-red-400">{error}</p>}

              <motion.button
                type="submit"
                disabled={isSubmitting || !passwordReady}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-yellow-500 text-sm font-semibold text-black transition-colors hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-50"
                whileHover={isSubmitting ? undefined : { scale: 1.01 }}
                whileTap={isSubmitting ? undefined : { scale: 0.98 }}
              >
                {isSubmitting ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/20 border-t-black" />
                    {isActivate ? 'Activating…' : 'Signing in…'}
                  </span>
                ) : (
                  <>
                    {isActivate ? 'Activate account' : 'Sign in'}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </motion.button>
            </form>
          )}

          <p className="mt-6 text-center text-xs leading-relaxed text-zinc-500">
            Alpha Test | Limited Access
          </p>
        </div>

        <p className="mt-4 px-2 text-center text-[13px] leading-relaxed text-zinc-500 text-balance">
          By continuing, you acknowledge that you understand and agree to the{' '}
          <a
            href="https://cryptelix.app/privacy-policy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-yellow-500/90 underline decoration-yellow-500/40 underline-offset-2 hover:text-yellow-400"
          >
            Privacy Policy
          </a>
          .
        </p>
      </motion.div>
    </div>
  );
}
