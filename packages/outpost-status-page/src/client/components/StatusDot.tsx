export type StatusTone = 'connected' | 'warning' | 'error' | 'neutral';

export let StatusDot = ({ tone }: { tone: StatusTone }) => (
  <span className={`status-dot status-dot--${tone}`} />
);
