import { redirect } from 'next/navigation';

/** /admin has no page of its own; the calendar is the working view. */
export default function AdminIndex() {
  redirect('/admin/calendar');
}
