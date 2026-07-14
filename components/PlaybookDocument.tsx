"use client";

import type { PlaybookSection } from "@/lib/ops/night-of-playbook";

export default function PlaybookDocument({
  title,
  subtitle,
  sections,
  variant = "ops",
}: {
  title: string;
  subtitle: string;
  sections: PlaybookSection[];
  variant?: "ops" | "partner";
}) {
  return (
    <article
      className={`playbook playbook--${variant}`}
      aria-label={title}
    >
      <header className="playbook__header">
        <div>
          <h1 className="playbook__title">{title}</h1>
          <p className="playbook__subtitle">{subtitle}</p>
        </div>
        <button
          type="button"
          className="btn btn-primary playbook__print no-print"
          onClick={() => window.print()}
        >
          Print / Save as PDF
        </button>
      </header>

      <div className="playbook__body">
        {sections.map((section) => (
          <section key={section.id} className="playbook__section" id={section.id}>
            <h2 className="playbook__section-title">{section.title}</h2>
            {section.intro ? (
              <p className="playbook__intro">{section.intro}</p>
            ) : null}
            <ul className="playbook__list">
              {section.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </article>
  );
}
