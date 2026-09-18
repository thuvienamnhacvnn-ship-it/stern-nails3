/**
 * Server configuration, read once.
 *
 * Everything integration-shaped defaults to "not configured", and each adapter
 * asks here whether it may do anything real. That is what makes the demo honest:
 * nothing can quietly start sending mail or taking money because a variable was
 * set on one machine.
 */

function flag(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return raw === '1' || raw.toLowerCase() === 'true';
}

export const env = {
  /**
   * Demo mode puts a badge on the interface, keeps every payment on the fake
   * provider and writes mail to the outbox instead of sending it. It is on
   * unless explicitly turned off, so a half-configured deployment is loud
   * rather than silently pretending to be live.
   */
  demoMode: flag('DEMO_MODE', true),

  /** Where the studio is reachable, used in links inside mail. */
  publicUrl: process.env.PUBLIC_URL ?? 'http://localhost:3110',

  email: {
    /** `outbox` writes rows and files; `smtp` would need a real adapter. */
    provider: process.env.EMAIL_PROVIDER ?? 'outbox',
    from: process.env.EMAIL_FROM ?? 'no-reply@stern-nails.invalid',
  },

  payments: {
    /** `demo` is the built-in fake. `stripe` and `paypal` are not wired up. */
    provider: process.env.PAYMENT_PROVIDER ?? 'demo',
    webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET ?? 'demo-webhook-secret',
  },

  ai: {
    /** `rules` is the offline recommender. `gemini` needs a key. */
    provider: process.env.AI_PROVIDER ?? 'rules',
    apiKey: process.env.AI_API_KEY ?? '',
    model: process.env.AI_MODEL ?? 'gemini-2.5-flash-latest',
    timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 8000),
  },

  whatsapp: {
    /** Off until the studio has a number and a business account. */
    enabled: flag('WHATSAPP_ENABLED', false),
    apiUrl: process.env.WHATSAPP_API_URL ?? '',
    apiKey: process.env.WHATSAPP_API_KEY ?? '',
  },

  /** Seeded so `npm run db:seed` produces a working admin on a fresh machine. */
  adminSeedPassword: process.env.ADMIN_SEED_PASSWORD ?? 'stern-demo-2026',
} as const;

/**
 * What the handover document calls "integrations still to configure". The admin
 * settings page renders this list, so the studio can see at a glance what is
 * real and what is a stand-in.
 */
export function integrationStatus() {
  return [
    {
      key: 'email',
      live: env.email.provider !== 'outbox',
      detail: env.email.provider === 'outbox'
        ? 'Mail is written to the outbox table and .data/outbox/, not sent.'
        : `Provider: ${env.email.provider}`,
    },
    {
      key: 'payments',
      live: env.payments.provider !== 'demo' && !env.demoMode,
      detail: env.payments.provider === 'demo'
        ? 'Card and PayPal run on the built-in fake provider. No money moves.'
        : `Provider: ${env.payments.provider}`,
    },
    {
      key: 'ai',
      live: env.ai.provider !== 'rules' && env.ai.apiKey !== '',
      detail: env.ai.provider === 'rules' || env.ai.apiKey === ''
        ? 'The stylist runs on the offline recommender over published looks.'
        : `Provider: ${env.ai.provider} (${env.ai.model})`,
    },
    {
      key: 'whatsapp',
      live: env.whatsapp.enabled && env.whatsapp.apiUrl !== '',
      detail: env.whatsapp.enabled ? 'Configured.' : 'Disabled: no number, no business account.',
    },
  ];
}
