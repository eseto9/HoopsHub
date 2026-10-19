import Link from "next/link";
import { ChevronRight, ExternalArrow } from "./icons";

/** Inset grouped section, like a block in iOS Settings. */
export function Group({
  header,
  footer,
  children,
  className = "",
}: {
  header?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      {header && <h2 className="group-header">{header}</h2>}
      <div className="list-group">{children}</div>
      {footer && <div className="group-footer">{footer}</div>}
    </section>
  );
}

/** Colored rounded-square icon. */
export function IconTile({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="icon-tile" style={{ background: color }}>
      {children}
    </span>
  );
}

type RowProps = {
  icon?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  value?: React.ReactNode;
  /** Internal link (chevron) or external link (arrow). */
  href?: string;
  external?: boolean;
  chevron?: boolean;
  className?: string;
  titleClassName?: string;
};

function RowInner({ icon, title, subtitle, value, href, external, chevron, titleClassName = "" }: RowProps) {
  return (
    <>
      {icon}
      <span className="row-body">
        <span className="min-w-0 flex-1">
          <span className={`block truncate ${titleClassName}`}>{title}</span>
          {subtitle && <span className="block truncate text-[15px] text-muted">{subtitle}</span>}
        </span>
        {value !== undefined && <span className="flex shrink-0 items-center gap-2 text-muted">{value}</span>}
        {href && (external ? <ExternalArrow className="h-3.5 w-3.5 shrink-0 text-faint" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-faint" />)}
        {!href && chevron && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-faint" />}
      </span>
    </>
  );
}

export function Row(props: RowProps) {
  const cls = `row ${props.className ?? ""}`;
  if (props.href && props.external) {
    return (
      <a href={props.href} target="_blank" rel="noreferrer" className={cls}>
        <RowInner {...props} />
      </a>
    );
  }
  if (props.href) {
    return (
      <Link href={props.href} className={cls}>
        <RowInner {...props} />
      </Link>
    );
  }
  return (
    <div className={cls}>
      <RowInner {...props} />
    </div>
  );
}

/** Free-form row content that keeps the inset separator, e.g. form fields. */
export function RowBlock({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="row-block">
      <div className={`row-body ${className}`}>{children}</div>
    </div>
  );
}

/** Text field row with the label on the left, like iOS forms. */
export function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="row-block cursor-text">
      <span className="row-body">
        <span className="w-24 shrink-0">{label}</span>
        <span className="min-w-0 flex-1">{children}</span>
      </span>
    </label>
  );
}
