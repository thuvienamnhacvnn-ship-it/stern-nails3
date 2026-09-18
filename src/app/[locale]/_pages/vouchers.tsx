import { t, type Locale } from '@/lib/i18n';
import { allowedAmounts } from '@/lib/vouchers';
import { brand } from '@/lib/media';
import { env } from '@/lib/env';
import { Motto, Petal } from '@/components/shell';
import { Gift, Heart, Leaf } from '@/components/icons';
import { VoucherForm } from '@/components/voucher-form';

/**
 * Gift cards, following 07-vouchers.
 *
 * The card in the middle is built from HTML and the real logo files rather than
 * shipped as a rendered picture. That is not purism: a mock-up image would go
 * soft on a large screen, could not be translated, and would have to be
 * re-exported every time the amount or the wording changed.
 */
export async function VouchersPage({ locale }: { locale: Locale }) {
  const copy = t(locale);
  const amounts = await allowedAmounts();
  const flower = brand('flower');
  const word = brand('wordmark');

  const PERK_ICON = [<Heart key="h" size={20} />, <Leaf key="l" size={20} />, <Gift key="g" size={20} />];

  return (
    <div className="vouchers">
      <Petal position="tl" />

      <section className="vouchers-intro">
        <span className="eyebrow">{copy.vouchers.eyebrow}</span>
        <h1 className="vouchers-title">
          Ein schöner
          <br />
          Moment.
          <br />
          Verschenkt.
        </h1>
        <hr className="rule" />
        <p className="lede" style={{ maxWidth: '30ch' }}>
          {copy.vouchers.intro}
        </p>

        <ul className="vouchers-perks">
          {copy.vouchers.perks.map((perk, index) => (
            <li key={perk} className="small">
              {PERK_ICON[index]}
              {perk}
            </li>
          ))}
        </ul>

        <div style={{ marginTop: 'var(--s4)' }} className="desktop-only">
          <Motto locale={locale} />
        </div>
      </section>

      {/* The card and its envelope are siblings so the card can sit in front;
          the whole scene is decoration, hence aria-hidden. */}
      <section className="vouchers-stage" aria-hidden="true">
        <div className="giftcard-scene">
          <div className="giftcard-envelope">
            <span>
              {copy.vouchers.cardFront.top.split(' ').map((line) => (
                <span key={line} style={{ display: 'block' }}>
                  {line}
                </span>
              ))}
            </span>
          </div>
          <div className="giftcard">
            <div className="giftcard-logo">
              <img src={flower.src} width={flower.width} height={flower.height} alt="" />
              <img className="word" src={word.src} width={word.width} height={word.height} alt="" />
            </div>
            <span className="giftcard-note">{copy.vouchers.cardFront.bottom}</span>
          </div>
        </div>
      </section>

      <section className="panel vouchers-form" aria-labelledby="voucher-designer">
        <div className="row row--between">
          <h2 id="voucher-designer" className="serif" style={{ fontSize: 34 }}>
            {copy.vouchers.designer}
          </h2>
          {env.demoMode ? <span className="badge">{copy.common.demo}</span> : null}
        </div>

        <VoucherForm locale={locale} amounts={amounts} />

        <p className="tiny muted">{copy.vouchers.seedNote}</p>
      </section>
    </div>
  );
}
