import "../demo.css";

export default function DemoPortalPage() {
  return (
    <div className="demo demo--portal">
      <header className="demo-portal__brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-white.png" alt="Oui Smoke" width={200} height={54} />
        <p>Event portal · live</p>
      </header>

      <section className="demo-portal__hero">
        <h1>Harborview Rooftop</h1>
        <p>Acme Collective · Distillery District</p>
        <p className="demo-portal__status">Status: active</p>
      </section>

      <section className="demo-portal__metrics" aria-label="Floor snapshot">
        <div>
          <strong>6</strong>
          <span>On floor</span>
        </div>
        <div>
          <strong>2</strong>
          <span>Guest calls</span>
        </div>
        <div>
          <strong>$75</strong>
          <span>Refills</span>
        </div>
      </section>

      <section className="demo-portal__list">
        <h2>On the floor</h2>
        <ul>
          <li>
            <span>#7 Blue Mist</span>
            <em>2 refills</em>
          </li>
          <li>
            <span>#12 Double Apple</span>
            <em>Needs check</em>
          </li>
          <li>
            <span>#18 Watermelon</span>
            <em>Call open</em>
          </li>
        </ul>
      </section>

      <section className="demo-portal__calls">
        <h2>Guest calls</h2>
        <ul>
          <li>
            <strong>Fresh coals</strong>
            <span>#18 · waiting</span>
          </li>
          <li>
            <strong>Flavour refill</strong>
            <span>#12 · acknowledged</span>
          </li>
        </ul>
      </section>
    </div>
  );
}
