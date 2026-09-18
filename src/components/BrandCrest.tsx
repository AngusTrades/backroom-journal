export function BrandCrest({ size = 20 }: { size?: number }) {
  const h = Math.round((size * 118) / 100);
  return (
    <svg width={size} height={h} viewBox="0 0 100 118" className="flex-none">
      <path
        d="M50 2 L96 16 V58 C96 90 76 108 50 116 C24 108 4 90 4 58 V16 Z"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="4"
      />
      <path
        d="M50 12 L88 24 V57 C88 84 71 99 50 106 C29 99 12 84 12 57 V24 Z"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.5"
        opacity="0.5"
      />
      <text
        x="50"
        y="70"
        textAnchor="middle"
        fontFamily="Georgia, serif"
        fontSize="34"
        fill="var(--text)"
      >
        TB
      </text>
    </svg>
  );
}
