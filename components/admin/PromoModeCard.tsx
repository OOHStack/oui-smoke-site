const PROMO_URL = "https://ouismoke.co/promo";

export default function PromoModeCard() {
  return (
    <section className="panel partner-share-card">
      <div className="partner-share-card__copy">
        <p className="eyebrow">Site kiosk</p>
        <h2 className="panel-title" style={{ marginBottom: "0.35rem" }}>
          Promo mode
        </h2>
        <p className="page-sub" style={{ margin: 0 }}>
          Static homepage kiosk: flip <code>promoMode</code> in{" "}
          <code>public/config.js</code>, open <code>/promo</code>, or add{" "}
          <code>?promo=1</code>. For a live event tablet (order flow + guest
          QR), open <strong>Display</strong> on that job. QR timing lives in{" "}
          <a href="/admin/settings?tab=display">Settings → Display</a>.
        </p>
      </div>
      <div className="partner-share-card__actions">
        <a
          className="btn btn-primary"
          href="/promo"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open /promo
        </a>
        <a className="btn btn-ghost" href="/admin/settings?tab=display">
          Display settings
        </a>
      </div>
      <p className="partner-share-card__url">{PROMO_URL}</p>
    </section>
  );
}
