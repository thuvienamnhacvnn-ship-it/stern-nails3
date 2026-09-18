import { NextResponse } from 'next/server';
import { signInStaff } from '@/lib/auth';
import { callerKey, rateLimit } from '@/lib/rate-limit';
import { audit } from '@/lib/audit';

/**
 * POST /api/admin/sign-in — a form post, so the login page needs no JavaScript.
 *
 * Rate limited hard: this is the one endpoint on the site where guessing gets
 * somebody the whole calendar. Both outcomes redirect, and the failure carries
 * only `error=credentials` — never which half was wrong.
 */
export async function POST(request: Request) {
  const limit = rateLimit(callerKey(request, 'admin-sign-in'), 8, 300);
  const origin = new URL(request.url).origin;

  if (!limit.allowed) {
    return NextResponse.redirect(new URL('/admin/login?error=credentials', origin), { status: 303 });
  }

  const form = await request.formData();
  const email = String(form.get('email') ?? '');
  const password = String(form.get('password') ?? '');

  const member = await signInStaff(email, password);
  if (!member) {
    // Logged without the password and without saying whether the account
    // exists, so the audit trail shows the attempt without becoming one.
    await audit({
      actorType: 'system',
      actorLabel: 'admin login',
      action: 'staff.sign_in_failed',
      entity: 'staff',
      after: { attemptedEmail: email.slice(0, 80) },
    });
    return NextResponse.redirect(new URL('/admin/login?error=credentials', origin), { status: 303 });
  }

  await audit({
    actorType: 'staff',
    actorId: member.id,
    actorLabel: member.displayName,
    action: 'staff.sign_in',
    entity: 'staff',
    entityId: member.id,
  });

  return NextResponse.redirect(new URL('/admin/calendar', origin), { status: 303 });
}
