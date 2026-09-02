export let formatDuration = (ms: number): string => {
  if (ms < 0) ms = 0;

  let seconds = Math.floor(ms / 1000);
  let minutes = Math.floor(seconds / 60);
  let hours = Math.floor(minutes / 60);
  let days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
};

export let formatDateTime = (ms: number): string =>
  new Date(ms).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  });

export let formatRelativeToNow = (ms: number): string => {
  let diff = ms - Date.now();
  let suffix = diff >= 0 ? 'from now' : 'ago';
  return `${formatDuration(Math.abs(diff))} ${suffix}`;
};
