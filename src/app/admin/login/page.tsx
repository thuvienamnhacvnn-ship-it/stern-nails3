import { redirect } from 'next/navigation';
import { currentStaff } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { env } from '@/lib/env';
import { brand } from '@/lib/media';

/**
 * Staff sign-in.
 *
 * A plain form posting to an API route, so it works without JavaScript. The
 * error comes back as a query parameter rather than as client state — there is
 * nothing on this page worth a client component.
 *
 * In demo mode the seeded credentials are printed, because a demo nobody can
 * sign into is not a demo. That block is gated on `env.demoMode`, which is off
 * the moment the studio configures anything real.
 */
export default async function AdminLogin({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (await currentStaff()) redirect('/admin/calendar');

  const copy = t('de');
  const query = await searchParams;
  const failed = query.error === 'credentials';
  const flower = brand('flower');

  return (
    <main
      className="page"
      style={{ display: 'grid', placeContent: 'center', minHeight: '100dvh', gap: 'var(--s3)', width: 'min(420px, 100%)', marginInline: 'auto' }}
    >
      <div className="stack stack--2" style={{ justifyItems: 'center', textAlign: 'center' }}>
        <img src={flower.src} width={flower.width} height={flower.height} alt="" style={{ width: 72 }} />
        <h1 className="serif" style={{ fontSize: 34 }}>
          {copy.admin.signInTitle}
        </h1>
        <p className="small muted">{copy.admin.signInIntro}</p>
      </div>

      <form className="panel panel--pad stack stack--2" method="post" action="/api/admin/sign-in">
        <div className="field">
          <label htmlFor="email">{copy.admin.emailLabel}</label>
          <input id="email" name="email" type="email" className="input" autoComplete="username" required />
        </div>
        <div className="field">
          <label htmlFor="password">{copy.admin.passwordLabel}</label>
          <input id="password" name="password" type="password" className="input" autoComplete="current-password" required />
        </div>

        {failed ? (
          <p className="notice notice--error" role="alert">
            {copy.admin.wrongCredentials}
          </p>
        ) : null}

        <button type="submit" className="btn btn--primary btn--block">
          {copy.admin.signIn}
        </button>
      </form>

      {env.demoMode ? (
        <p className="tiny muted center">
          Demo: admin@stern-nails.demo · {env.adminSeedPassword}
        </p>
      ) : null}
    </main>
  );
}
