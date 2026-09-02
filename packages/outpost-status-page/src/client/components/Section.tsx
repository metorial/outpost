import type { ReactNode } from 'react';

export let Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="section">
    <h2 className="section-title">{title}</h2>
    <div className="section-body">{children}</div>
  </section>
);
