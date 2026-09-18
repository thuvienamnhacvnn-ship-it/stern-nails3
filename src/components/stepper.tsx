import { t, type Locale } from '@/lib/i18n';
import { Check } from './icons';

/**
 * The five-step progress bar from 04 and 05.
 *
 * On a phone it is not a bar at all. Five dots with labels need about 600px;
 * squeezed into 390 they either overflow the page — dragging the whole grid
 * wider than the viewport with them — or shrink into unreadable stubs. So below
 * the breakpoint it becomes the single line the mobile design shows, "Schritt 3
 * von 5", which says the same thing in the space available.
 *
 * Either way it is an ordered list with the current step marked by
 * `aria-current`, so a screen reader hears the position rather than inferring
 * it from colour.
 */
export function Stepper({ locale, current }: { locale: Locale; current: number }) {
  const copy = t(locale);
  const steps = copy.booking.steps;
  const label = copy.booking.stepOf(current, steps.length);

  return (
    <nav aria-label={label}>
      <ol className="stepper desktop-only" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {steps.map((step, index) => {
          const number = index + 1;
          const state = number < current ? 'done' : number === current ? 'current' : 'todo';
          return (
            <li key={step} style={{ display: 'contents' }}>
              {index > 0 ? <span className="step-line" aria-hidden="true" /> : null}
              <span className="step" data-state={state} aria-current={state === 'current' ? 'step' : undefined}>
                <span className="step-dot">{state === 'done' ? <Check size={18} /> : number}</span>
                <span className="step-label">{step}</span>
              </span>
            </li>
          );
        })}
      </ol>

      <p className="mobile-only small muted" aria-current="step">
        {label} · {steps[current - 1]}
      </p>
    </nav>
  );
}
