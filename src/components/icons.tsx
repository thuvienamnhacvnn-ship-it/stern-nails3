/**
 * The icon set, inline.
 *
 * Drawn here rather than pulled from a package: there are fifteen of them, they
 * share one stroke weight, and shipping an icon library to draw fifteen shapes
 * costs more than the shapes do. Every icon is 24×24 on a 1.4 stroke, inherits
 * `currentColor`, and is `aria-hidden` — an icon next to a label is decoration,
 * and an icon alone gets a visually hidden label from its button.
 */
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 24, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const ArrowRight = (p: IconProps) => (
  <Icon {...p} className={['arrow', p.className].filter(Boolean).join(' ')}>
    <path d="M4 12h15M13 6l6 6-6 6" />
  </Icon>
);

export const ArrowLeft = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 12H5M11 6l-6 6 6 6" />
  </Icon>
);

export const ChevronDown = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 9l6 6 6-6" />
  </Icon>
);

export const ChevronLeft = (p: IconProps) => (
  <Icon {...p}>
    <path d="M15 5l-7 7 7 7" />
  </Icon>
);

export const ChevronRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 5l7 7-7 7" />
  </Icon>
);

export const Heart = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
  <Icon {...p} fill={filled ? 'currentColor' : 'none'}>
    <path d="M12 20s-7-4.35-7-9.3A4.1 4.1 0 0 1 12 8a4.1 4.1 0 0 1 7 2.7C19 15.65 12 20 12 20Z" />
  </Icon>
);

export const User = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="8.5" r="3.4" />
    <path d="M4.8 19.6a7.4 7.4 0 0 1 14.4 0" />
  </Icon>
);

export const Users = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="9" cy="8.6" r="3" />
    <path d="M3.4 19a5.9 5.9 0 0 1 11.2 0" />
    <path d="M16 6.2a3 3 0 0 1 0 5.9M17.6 14.6a5.9 5.9 0 0 1 3 4.4" />
  </Icon>
);

export const CalendarIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
    <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" />
  </Icon>
);

export const Clock = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.4" />
    <path d="M12 7.6V12l3 1.8" />
  </Icon>
);

export const Leaf = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 4c0 8-4.6 12.6-11 12.6A5.6 5.6 0 0 1 8.4 6C13 5 16.5 4 20 4Z" />
    <path d="M4 20c1.8-3.6 4.4-6.4 8-8.4" />
  </Icon>
);

export const Gift = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.6" y="10" width="16.8" height="10" rx="2" />
    <path d="M3 7h18v3H3zM12 7v13" />
    <path d="M12 7S10.6 3.6 8.6 4.1 8 7 12 7ZM12 7s1.4-3.4 3.4-2.9S16 7 12 7Z" />
  </Icon>
);

export const Sparkle = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3.6l1.7 4.7 4.7 1.7-4.7 1.7L12 16.4l-1.7-4.7-4.7-1.7 4.7-1.7Z" />
    <path d="M18.6 15.2l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8Z" />
  </Icon>
);

export const Gem = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7.4 4h9.2l3.4 5-8 11-8-11Z" />
    <path d="M4 9h16" />
    <path d="M9.6 9L12 20M14.4 9L12 20" />
  </Icon>
);

export const Search = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="6.4" />
    <path d="M15.8 15.8L20 20" />
  </Icon>
);

export const Grid = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4" y="4" width="6.4" height="6.4" rx="1.4" />
    <rect x="13.6" y="4" width="6.4" height="6.4" rx="1.4" />
    <rect x="4" y="13.6" width="6.4" height="6.4" rx="1.4" />
    <rect x="13.6" y="13.6" width="6.4" height="6.4" rx="1.4" />
  </Icon>
);

export const Home = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 10.6L12 4l8 6.6V20H4z" />
  </Icon>
);

export const Menu = (p: IconProps) => (
  <Icon {...p} strokeWidth={1.6}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
);

export const Close = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

export const Mail = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.4" y="5.6" width="17.2" height="12.8" rx="2.2" />
    <path d="M3.8 7.2L12 12.6l8.2-5.4" />
  </Icon>
);

export const Phone = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6.4 4.2h3l1.4 3.6-2 1.4a10.6 10.6 0 0 0 5 5l1.4-2 3.6 1.4v3a1.8 1.8 0 0 1-2 1.8A15.4 15.4 0 0 1 4.6 6.2a1.8 1.8 0 0 1 1.8-2Z" />
  </Icon>
);

export const MapPin = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 21s6.4-6 6.4-10.4a6.4 6.4 0 1 0-12.8 0C5.6 15 12 21 12 21Z" />
    <circle cx="12" cy="10.4" r="2.4" />
  </Icon>
);

export const Coins = (p: IconProps) => (
  <Icon {...p}>
    <ellipse cx="12" cy="7" rx="7" ry="3" />
    <path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7" />
    <path d="M5 12v4c0 1.7 3.1 3 7 3s7-1.3 7-3v-4" />
  </Icon>
);

export const Check = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12.5l4.6 4.5L19 7.5" />
  </Icon>
);

export const CheckCircle = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M8.2 12.4l2.6 2.6 5-5.4" />
  </Icon>
);

export const Trash = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.6 6.6h14.8M9.4 6.6V4.8h5.2v1.8M6.6 6.6l.9 12.2h9l.9-12.2" />
  </Icon>
);

export const Settings = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.2 14.2a1.6 1.6 0 0 0 .3 1.8l.1.1a1.9 1.9 0 1 1-2.7 2.7l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.2a1.9 1.9 0 1 1-3.8 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a1.9 1.9 0 1 1-2.7-2.7l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1h-.2a1.9 1.9 0 0 1 0-3.8h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a1.9 1.9 0 1 1 2.7-2.7l.1.1a1.6 1.6 0 0 0 1.8.3h.1a1.6 1.6 0 0 0 1-1.5v-.2a1.9 1.9 0 0 1 3.8 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a1.9 1.9 0 1 1 2.7 2.7l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1h.2a1.9 1.9 0 0 1 0 3.8h-.1a1.6 1.6 0 0 0-1.5 1Z" />
  </Icon>
);

export const Palette = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3.6a8.4 8.4 0 0 0 0 16.8c1.2 0 1.8-.8 1.8-1.7 0-1.4-1-1.6-1-2.6a1.7 1.7 0 0 1 1.8-1.6h1.6a4.2 4.2 0 0 0 4.2-4.3c0-3.8-3.8-6.6-8.4-6.6Z" />
    <circle cx="8.2" cy="9.6" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="7.4" r="1" fill="currentColor" stroke="none" />
    <circle cx="15.6" cy="9.4" r="1" fill="currentColor" stroke="none" />
  </Icon>
);

export const Ruler = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.2" y="8.4" width="17.6" height="7.2" rx="1.8" transform="rotate(-20 12 12)" />
    <path d="M8.4 8.6l.8 1.8M11.4 7.6l1.2 2.6M14.4 6.4l.8 1.8" />
  </Icon>
);

export const Hand = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 11.4V5.6a1.3 1.3 0 0 1 2.6 0v5.2" />
    <path d="M11.6 10.8V4.6a1.3 1.3 0 0 1 2.6 0v6.2" />
    <path d="M14.2 11.2V6.4a1.3 1.3 0 0 1 2.6 0v6.8" />
    <path d="M9 11.4V9.2a1.3 1.3 0 0 0-2.6 0v4.6c0 3.3 2.4 6 5.6 6h1.2a5.6 5.6 0 0 0 5.6-5.6v-1" />
  </Icon>
);

export const Foot = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8.4 20.2c2.6 0 4.2-1.2 4.2-3.4 0-1.8-.8-2.8-.8-4.6 0-2.8 1.6-3.6 1.6-6.2A2.6 2.6 0 0 0 10.6 3.4C8 3.4 6 6.2 6 10.6c0 2 .4 3.2.4 4.8 0 1.6-.8 2.2-.8 3.2 0 1 .9 1.6 2.8 1.6Z" />
    <path d="M15.4 6.6a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2ZM17.6 9.6a1 1 0 1 1 0 2 1 1 0 0 1 0-2ZM18.6 12.8a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8Z" />
  </Icon>
);

export const NailShape = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 20.4h6c.5-3 .8-6 .8-9C15.8 7.4 14.2 4 12 4S8.2 7.4 8.2 11.4c0 3 .3 6 .8 9Z" />
  </Icon>
);

export const Attachment = (p: IconProps) => (
  <Icon {...p}>
    <path d="M18.4 11.2l-6.8 6.8a4 4 0 0 1-5.6-5.6l7.2-7.2a2.7 2.7 0 0 1 3.8 3.8l-7.2 7.2a1.3 1.3 0 0 1-1.9-1.9l6.4-6.4" />
  </Icon>
);

export const Dots = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="6" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="18" cy="12" r="1.2" fill="currentColor" stroke="none" />
  </Icon>
);

export const ListIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8.4 7h11.2M8.4 12h11.2M8.4 17h11.2M4.4 7h.01M4.4 12h.01M4.4 17h.01" />
  </Icon>
);

export const Note = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20.4 12.4a7.4 7.4 0 0 1-8 7.4L4 20.4l1-3.6a7.4 7.4 0 1 1 15.4-4.4Z" />
  </Icon>
);

export const Plus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const Store = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 9.6V19a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9.6" />
    <path d="M3.2 9.6L4.8 4.6h14.4l1.6 5a3 3 0 0 1-5.6 1.6 3 3 0 0 1-5.6 0 3 3 0 0 1-5.6-1.6Z" />
  </Icon>
);

export const Card = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="5.6" width="18" height="12.8" rx="2.2" />
    <path d="M3 10h18" />
  </Icon>
);

/*
 * The social marks. Drawn as simple glyphs rather than the platforms' official
 * logos: the official ones are trademarks with their own usage rules, and this
 * set has to sit at 18px in a footer next to a cream serif without shouting.
 */
export const Instagram = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.6" y="3.6" width="16.8" height="16.8" rx="5" />
    <circle cx="12" cy="12" r="4.1" />
    <circle cx="16.9" cy="7.1" r="1" fill="currentColor" stroke="none" />
  </Icon>
);

export const Facebook = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14.8 4.4h-2a3.4 3.4 0 0 0-3.4 3.4V10H7.4v3h2v7h3v-7h2.2l.6-3h-2.8V8a.9.9 0 0 1 .9-.9h1.9Z" />
  </Icon>
);

export const TikTok = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14.2 3.6v10.6a3.5 3.5 0 1 1-2.8-3.4" />
    <path d="M14.2 3.6a4.6 4.6 0 0 0 4.4 4.3" />
  </Icon>
);

export const YouTube = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2.8" y="5.8" width="18.4" height="12.4" rx="4" />
    <path d="M10.4 9.4l4.6 2.6-4.6 2.6Z" />
  </Icon>
);

export const PayPal = (p: IconProps) => (
  <Icon {...p} strokeWidth={1.2}>
    <path d="M7.6 19.4L9.8 5h5.1c2.5 0 3.9 1.3 3.5 3.6-.4 2.5-2.3 3.9-5 3.9h-2l-.9 6.9Z" />
    <path d="M6 16.4h2.4" />
  </Icon>
);
