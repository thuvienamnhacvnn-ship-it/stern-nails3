import { t, type Locale } from '@/lib/i18n';
import { allowedAmounts } from '@/lib/vouchers';
import { brand } from '@/lib/media';
import { env } from '@/lib/env';
import { Photo } from '@/components/image';
import { Gem, Gift, Heart, Leaf, Mail, Sparkle } from '@/components/icons';
import { VoucherForm } from '@/components/voucher-form';

/**
 * Gift cards.
 *
 * One screen over a photograph of the studio, the way the start page and the
 * studio page work: the word at the left, the cards themselves in the middle,
 * and the designer as a pane of smoked glass down the right.
 *
 * The cards in the middle are built from HTML and the real logo files rather
 * than shipped as a rendered picture. That is not purism: a mock-up image would
 * go soft on a large screen, could not be translated, and would have to be
 * re-exported every time the wording changed.
 */
export async function VouchersPage({ locale }: { locale: Locale }) {
  const copy = t(locale);
  const amounts = await allowedAmounts();
  const flower = brand('flower');
  const word = brand('wordmark');

  const PERK_ICON = [<Gift key="g" size={20} />, <Leaf key="l" size={20} />, <Mail key="m" size={20} />];
  const ASSURANCE_ICON = [
    <Gem key="gem" size={20} />,
    <Sparkle key="sp" size={20} />,
    <Heart key="he" size={20} />,
    <Leaf key="le" size={20} />,
  ];

  return (
    <div className="vouchers">
      {/* The room behind everything. Decorative: the page is about the card,
          not about this photograph, and the studio page describes the premises. */}
      <div className="vouchers-stage" aria-hidden="true">
        <Photo id="real-pedicure" alt="" sizes="100vw" priority focalPoint="52% 46%" />
        <span className="vouchers-scrim" />
      </div>

      {/* The pane the words sit on by day. Decoration only. */}
      <span className="vouchers-plate" aria-hidden="true" />

      <div className="vouchers-grid">
        {/* ------------------------------------------------------- the word */}
        <section className="vouchers-copy">
          <span className="vouchers-eyebrow">{copy.vouchers.eyebrow}</span>

          <h1 className="vouchers-title">
            {copy.vouchers.titleLead}
            <span className="vouchers-title-accent">{copy.vouchers.titleAccent}</span>
          </h1>

          <span className="vouchers-rule" aria-hidden="true" />

          <p className="vouchers-intro">{copy.vouchers.intro}</p>

          <ul className="vouchers-perks">
            {copy.vouchers.perks.map((perk, index) => (
              <li key={perk}>
                {PERK_ICON[index]}
                <span>{perk}</span>
              </li>
            ))}
          </ul>

          <span className="vouchers-script script" aria-hidden="true">
            {copy.brand.script}
            <Heart size={18} />
          </span>
        </section>

        {/* ------------------------------------------------------ the cards */}
        <section className="vouchers-cards">
          <div className="giftcard-scene" aria-hidden="true">
            {/* Behind and to the right: the motto side. */}
            <div className="giftcard giftcard--back">
              <span className="giftcard-motto">
                {copy.brand.motto.map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </span>
            </div>
            {/* In front: the mark, as it is printed. */}
            <div className="giftcard giftcard--front">
              <span className="giftcard-logo">
                <img src={flower.src} width={flower.width} height={flower.height} alt="" />
                <img className="word" src={word.src} width={word.width} height={word.height} alt="" />
              </span>
              <span className="giftcard-note">{copy.vouchers.cardFront.bottom}</span>
            </div>
          </div>

          <ul className="vouchers-assurances">
            {copy.vouchers.assurances.map((lines, index) => (
              <li key={lines.join(' ')}>
                {ASSURANCE_ICON[index]}
                <span>
                  {lines.map((line) => (
                    <span key={line}>{line}</span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* --------------------------------------------------- the designer */}
        <section className="vouchers-designer" aria-labelledby="voucher-designer">
          <div className="vouchers-designer-head">
            <h2 id="voucher-designer" className="vouchers-designer-title">
              {copy.vouchers.designer}
            </h2>
            {env.demoMode ? <span className="badge">{copy.common.demo}</span> : null}
          </div>

          <VoucherForm locale={locale} amounts={amounts} />

          <p className="tiny vouchers-seed-note">{copy.vouchers.seedNote}</p>
        </section>
      </div>
    </div>
  );
}
