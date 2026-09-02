export let Logo = ({
  size = 20,
  color = '#111'
}: {
  size?: number | string;
  color?: string;
}) => (
  <svg height={size} width={size} viewBox="0 0 56 56" fill="none" aria-hidden="true">
    <path d="M28.12 0L50 44.24L44 56L28.12 21L11.88 56L6 44.24L28.12 0Z" fill={color} />
  </svg>
);
