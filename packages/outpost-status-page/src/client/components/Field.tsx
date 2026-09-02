import type { ReactNode } from 'react';

export let Field = ({ label, value }: { label: string; value: ReactNode }) => (
  <div className="field">
    <div className="field-label">{label}</div>
    <div className="field-value">{value}</div>
  </div>
);
