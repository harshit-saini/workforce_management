import { ReactNode } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { btnPrimary, btnSecondary } from "@/lib/ui";

export interface EmptyAction {
  label: string;
  onClick?: () => void;
  /** Renders a link instead of a button. */
  to?: string;
  disabled?: boolean;
}

function ActionButton({ action, className }: { action: EmptyAction; className: string }) {
  if (action.to) {
    return (
      <Link to={action.to} className={className}>
        {action.label}
      </Link>
    );
  }
  return (
    <button onClick={action.onClick} disabled={action.disabled} className={className}>
      {action.label}
    </button>
  );
}

/**
 * What to show instead of a blank area: an icon, what this place is for in one sentence, and
 * what to do next. Styled like the import drop zone. `bare` drops the dashed box for use inside
 * small panels (a dropdown, a chart card).
 */
export default function EmptyState({
  icon,
  title,
  description,
  primary,
  secondary,
  bare = false,
}: {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  primary?: EmptyAction;
  secondary?: EmptyAction;
  bare?: boolean;
}) {
  return (
    <div
      className={clsx(
        "flex flex-col items-center justify-center gap-2 text-center",
        bare ? "px-4 py-6" : "rounded-xl border-2 border-dashed border-gray-300 bg-white px-6 py-12"
      )}
    >
      <span className="text-subtle [&>svg]:w-8 [&>svg]:h-8">{icon}</span>
      <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
      {description && <p className="text-sm text-gray-600 max-w-md">{description}</p>}
      {(primary || secondary) && (
        <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
          {primary && <ActionButton action={primary} className={btnPrimary} />}
          {secondary && <ActionButton action={secondary} className={btnSecondary} />}
        </div>
      )}
    </div>
  );
}
