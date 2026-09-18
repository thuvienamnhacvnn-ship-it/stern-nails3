import { NextResponse } from 'next/server';
import { signOutStaff } from '@/lib/auth';

/** POST /api/admin/sign-out. The session row goes, not just the cookie. */
export async function POST(request: Request) {
  await signOutStaff();
  return NextResponse.redirect(new URL('/admin/login', new URL(request.url).origin), { status: 303 });
}
