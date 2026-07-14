import "../demo.css";

export default function DemoOpsPage() {
  return (
    <div className="demo demo--ops">
      <header className="demo-ops__top">
        <div>
          <p className="demo-ops__brand">Oui Smoke · Ops</p>
          <h1>Live floor</h1>
        </div>
        <span className="demo-ops__pill">Sample event</span>
      </header>

      <section className="demo-ops__hero">
        <div>
          <p className="demo-ops__kicker">Tonight</p>
          <h2>Harborview Rooftop · Corporate</h2>
          <p className="demo-ops__meta">8 hookahs · Active · 92 guests</p>
        </div>
        <div className="demo-ops__stats">
          <div>
            <strong>6</strong>
            <span>On floor</span>
          </div>
          <div>
            <strong>2</strong>
            <span>Open calls</span>
          </div>
          <div>
            <strong>1</strong>
            <span>Overdue check</span>
          </div>
        </div>
      </section>

      <section className="demo-ops__grid" aria-label="Hookah board">
        {[
          { n: 7, flavour: "Blue Mist", state: "On floor", tone: "ok" },
          { n: 12, flavour: "Double Apple", state: "Needs check", tone: "warn" },
          { n: 3, flavour: "Mint", state: "On floor", tone: "ok" },
          { n: 18, flavour: "Watermelon", state: "Guest call", tone: "accent" },
          { n: 5, flavour: "Grape", state: "Staged", tone: "mute" },
          { n: 9, flavour: "Peach Ice", state: "On floor", tone: "ok" },
        ].map((h) => (
          <article key={h.n} className={`demo-ops__tile demo-ops__tile--${h.tone}`}>
            <header>
              <span>#{h.n}</span>
              <em>{h.state}</em>
            </header>
            <p>{h.flavour}</p>
          </article>
        ))}
      </section>

      <section className="demo-ops__feed">
        <h3>Activity</h3>
        <ul>
          <li>
            <time>9:14</time>
            <span>Guest #18 requested fresh coals</span>
          </li>
          <li>
            <time>9:08</time>
            <span>Check completed on #7</span>
          </li>
          <li>
            <time>8:51</time>
            <span>Refill sent · Double Apple on #12</span>
          </li>
        </ul>
      </section>
    </div>
  );
}
