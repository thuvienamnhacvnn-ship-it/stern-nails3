import Link from 'next/link';
import { t, type Locale } from '@/lib/i18n';
import { env } from '@/lib/env';
import { can, type Capability } from '@/lib/auth';
import { brand } from '@/lib/media';
import { CalendarIcon, Gift, Grid, Leaf, Settings, Users } from './icons';

/**
 * The frame every admin page sits in.
 *
 * The navigation is filtered by what the signed-in member of staff may actually
 * do — but that is a courtesy, not the boundary. Every page and every action
 * behind these links checks the same capability on the server, because a hidden
 * link is not access control.
 */

type Section = 'calendar' | 'services' | 'looks' | 'vouchers' | 'customers' | 'settings';

const NAV: { key: Section; href: string; capability: Capability; icon: React.ReactNode }[] = [
  { key: 'calendar', href: '/admin/calendar', capability: 'calendar.read.own', icon: <CalendarIcon size={20} /> },
  { key: 'services', href: '/admin/services', capability: 'catalogue.write', icon: <Leaf size={20} /> },
  { key: 'looks', href: '/admin/looks', capability: 'content.write', icon: <Grid size={20} /> },
  { key: 'vouchers', href: '/admin/vouchers', capability: 'vouchers.read', icon: <Gift size={20} /> },
  { key: 'customers', href: '/admin/customers', capability: 'calendar.read.all', icon: <Users size={20} /> },
  { key: 'settings', href: '/admin/settings', capability: 'settings.write', icon: <Settings size={20} /> },
];

export function AdminShell({
  current,
  role,
  staffName,
  children,
}: {
  current: Section;
  role: 'owner' | 'manager' | 'staff';
  staffName: string;
  children: React.ReactNode;
}) {
  const copy = t('de' as Locale);
  const flower = brand('flower');

  return (
    <div className="admin-shell">
      <aside className="admin-side">
        <Link href="/admin/calendar" className="logo" aria-label={copy.admin.title}>
          <img src={flower.src} width={flower.width} height={flower.height} alt="" style={{ width: 34 }} />
          <span className="serif" style={{ fontSize: 19 }}>
            {copy.admin.title}
          </span>
        </Link>

        <div className="row row--tight">
          {env.demoMode ? <span className="badge">{copy.common.demo}</span> : null}
          <span className="tiny muted">
            {staffName} · {role}
          </span>
        </div>

        <nav className="admin-nav" aria-label={copy.admin.title}>
          {NAV.filter((item) => can(role, item.capability)).map((item) => (
            <Link key={item.key} href={item.href} aria-current={current === item.key ? 'page' : undefined}>
              {item.icon}
              {copy.admin.nav[item.key === 'customers' ? 'customers' : item.key]}
            </Link>
          ))}
        </nav>

        <form action="/api/admin/sign-out" method="post">
          <button type="submit" className="btn btn--text small">
            {copy.admin.signOut}
          </button>
        </form>
      </aside>

      <main className="admin-main" id="main">
        {children}
      </main>
    </div>
  );
}

/** The page a member of staff sees when a section is above their role. */
export function Forbidden() {
  return (
    <div className="empty-state" style={{ margin: 'auto' }}>
      <h3>Keine Berechtigung</h3>
      <p className="lede">Dieser Bereich ist deiner Rolle nicht zugewiesen. Frag die Inhaberin.</p>
      <Link className="btn btn--secondary" href="/admin/calendar">
        Zum Kalender
      </Link>
    </div>
  );
}
