import { NextResponse } from 'next/server';
import { signOutCustomer } from '@/lib/auth';

/**
 * POST /api/account/sign-out.
 *
 * POST rather than GET so a prefetch, a link scanner or an <img> in an email
 * cannot sign somebody out. The session row is deleted, not just the cookie —
 * a cookie copied before signing out has to stop working too.
 */
export async function POST(request: Request) {
  await signOutCustomer();
  const url = new URL(request.url);
  return NextResponse.redirect(new URL('/de/konto', url.origin), { status: 303 });
}
