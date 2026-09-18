export function PageHead({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="pagehead mb-5 flex flex-col items-start gap-3 md:flex-row md:items-start md:justify-between md:gap-4">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {/* On mobile the action (usually a period-tabs pill row, or a button)
          gets its own full-width line below the title instead of being
          squeezed into whatever's left beside it; -mx-4 px-4 lets it bleed
          to the page's own edges so a too-wide pill row can scroll within
          itself without also widening the page. */}
      {action && <div className="-mx-4 w-[calc(100%+2rem)] overflow-x-auto px-4 md:mx-0 md:w-auto md:overflow-visible md:px-0">{action}</div>}
    </div>
  );
}
