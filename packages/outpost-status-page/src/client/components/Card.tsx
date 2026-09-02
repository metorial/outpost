import type { ReactNode } from 'react';

export let Card = ({ children }: { children: ReactNode }) => (
  <div className="card">{children}</div>
);
