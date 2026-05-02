type BreadcrumbsProps = {
  items: string[];
};

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav className="breadcrumbs flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[12px]" aria-label="页面导航" data-breadcrumb-tone="embedded">
      {items.map((item, index) => (
        <span key={`${item}-${index}`} className="breadcrumb-item inline-flex min-w-0 max-w-full items-center gap-2" data-breadcrumb-index={index}>
          {index > 0 ? <span className="breadcrumb-separator inline-flex h-1 w-1 rounded-full bg-current/35" aria-hidden="true" /> : null}
          <span
            className={[
              'breadcrumb-label inline-block max-w-[14rem] overflow-hidden text-ellipsis whitespace-nowrap sm:max-w-[18rem]',
              index === items.length - 1 ? 'font-medium text-foreground' : 'text-muted-foreground',
            ].join(' ')}
          >
            {item}
          </span>
        </span>
      ))}
    </nav>
  );
}
