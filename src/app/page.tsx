import { redirect } from 'next/navigation';
import { DEFAULT_LOCALE, path } from '@/lib/i18n';

/** The root sends visitors to the German start page, which is the default. */
export default function Root() {
  redirect(path(DEFAULT_LOCALE, 'start'));
}
