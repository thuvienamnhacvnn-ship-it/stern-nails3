import type { MetadataRoute } from 'next';
import { brand } from '@/lib/media';

/**
 * The web app manifest.
 *
 * What it buys: added to a phone's home screen the site opens without the
 * browser's own bars, which is what makes the bottom bar read as an app's tab
 * bar rather than as a strip at the foot of a web page.
 *
 * `start_url` is the German start page because German is the site; somebody who
 * installed it from the English pages still lands here, and the DE/EN switch is
 * in the header of every page.
 *
 * Nothing here is a claim about the business. The name and the short name are
 * the mark, and the icons are the mark on the site's own cream — no address, no
 * category, nothing the studio has not confirmed.
 */
export default function manifest(): MetadataRoute.Manifest {
  const icon192 = brand('app-icon-192');
  const icon512 = brand('app-icon-512');
  const maskable = brand('app-icon-maskable');

  return {
    name: 'Stern Nails 3',
    short_name: 'Stern Nails',
    description: 'Maniküre, Modellage, Pediküre und Nail Looks.',
    start_url: '/de/start',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f7f2e9',
    theme_color: '#f7f2e9',
    icons: [
      { src: icon192.src, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: icon512.src, sizes: '512x512', type: 'image/png', purpose: 'any' },
      /* Its own entry: a launcher that crops to a circle needs an icon drawn
         with room to be cropped, and one that does not must never be given it —
         otherwise the mark sits tiny in the middle of a cream square. */
      { src: maskable.src, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
