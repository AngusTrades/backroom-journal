type Point = { date: Date; cumulative: number };

export function EquityCurve({ data }: { data: Point[] }) {
  const plotWidth = 1000;
  const height = 220;
  const padTop = 20;
  const padBottom = 20;

  if (data.length === 0) {
    return (
      <div
        className="flex h-[220px] items-center justify-center text-[13px]"
        style={{ color: "var(--text-mute)" }}
      >
        No trades yet — the equity curve fills in as you log them.
      </div>
    );
  }

  const values = data.map((d) => d.cumulative);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  const usableHeight = height - padTop - padBottom;
  const x = (i: number) => (data.length === 1 ? plotWidth : (i / (data.length - 1)) * plotWidth);
  const y = (v: number) => padTop + usableHeight - ((v - min) / range) * usableHeight;

  const points = data.map((d, i) => [x(i), y(d.cumulative)] as const);
  const linePath = points.map(([px, py], i) => `${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  const fillPath = `${linePath} L${plotWidth},${height} L0,${height} Z`;

  const last = values[values.length - 1];
  const isGood = last >= 0;
  const color = isGood ? "var(--good)" : "var(--bad)";

  // The plot SVG below is stretched to fill however wide the card happens
  // to be (preserveAspectRatio="none", so the line always reaches the full
  // width) while its height stays fixed — on a wide screen that's a much
  // bigger horizontal scale factor than vertical. Axis-label text used to
  // live inside that same stretched coordinate space, so the glyphs got
  // warped by the mismatch (worse the wider the card got — exactly what
  // showed up as "stretched" on a wide monitor). Labels are now plain DOM
  // text in their own fixed-width column next to the SVG instead, so they
  // always render at their real font size regardless of card width.
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const v = max - t * range;
    const yPos = padTop + t * usableHeight;
    return { topPct: (yPos / height) * 100, label: `${v >= 0 ? "+" : ""}${v.toFixed(1)}R` };
  });

  return (
    <div className="equity-curve">
      <svg
        className="equity-curve-plot"
        width="100%"
        height={height}
        viewBox={`0 0 ${plotWidth} ${height}`}
        preserveAspectRatio="none"
      >
        {gridLines.map((g, i) => (
          <line
            key={i}
            x1="0"
            y1={(g.topPct / 100) * height}
            x2={plotWidth}
            y2={(g.topPct / 100) * height}
            stroke="var(--border-soft)"
            strokeWidth="1"
          />
        ))}
        <path d={fillPath} fill={color} opacity="0.1" />
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {points.length > 0 && (
          <circle cx={points[points.length - 1][0]} cy={points[points.length - 1][1]} r="4.5" fill={color} />
        )}
      </svg>
      <div className="equity-curve-labels" style={{ height }}>
        {gridLines.map((g, i) => (
          <span key={i} style={{ top: `${g.topPct}%` }}>
            {g.label}
          </span>
        ))}
      </div>
    </div>
  );
}
