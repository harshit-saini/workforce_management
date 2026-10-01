import { Link } from "react-router-dom";
import clsx from "clsx";
import { useSetup } from "@/hooks/useSetup";
import { IconCheck, IconX } from "@/components/icons";
import { btnPrimary, btnSecondary, card } from "@/lib/ui";

/**
 * The first thing a new owner sees: what to set up, in order, with only the next step as the
 * primary action so there is one obvious thing to do.
 */
export default function GettingStarted() {
  const setup = useSetup();
  if (!setup.isAdmin || !setup.loaded || setup.dismissed) return null;

  if (setup.allDone) {
    if (!setup.celebrate) return null;
    return (
      <div className={`${card} p-4 flex items-center justify-between gap-3 border-l-[3px] border-l-green-600`}>
        <div>
          <div className="text-sm font-semibold text-gray-900">You're all set up</div>
          <div className="text-sm text-gray-600">Centers, departments, your team, tasks and managers are in place.</div>
        </div>
        <button onClick={setup.dismiss} className={btnSecondary}>
          Dismiss
        </button>
      </div>
    );
  }

  const percent = (setup.doneCount / setup.total) * 100;
  return (
    <section className={`${card} p-5`} aria-labelledby="getting-started-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="getting-started-title" className="text-base font-semibold text-gray-900">
            Get your workspace ready
          </h2>
          <p className="text-sm text-gray-600 mt-0.5">
            {setup.doneCount} of {setup.total} done
          </p>
        </div>
        <button
          onClick={setup.dismiss}
          className="text-subtle hover:text-gray-700 rounded p-1"
          aria-label="Dismiss the setup checklist"
          title="Hide this. You can still do each step from the menu."
        >
          <IconX className="w-4 h-4" />
        </button>
      </div>
      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mt-3" role="progressbar" aria-valuemin={0} aria-valuemax={setup.total} aria-valuenow={setup.doneCount} aria-label="Setup progress">
        <div className="h-full bg-brand-600 rounded-full transition-all" style={{ width: `${percent}%` }} />
      </div>
      <ol className="mt-4 divide-y divide-gray-100">
        {setup.steps.map((step, i) => {
          const isNext = step.key === setup.nextKey;
          return (
            <li key={step.key} className="py-3 flex items-start gap-3">
              <span
                className={clsx(
                  "mt-0.5 w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-xs font-semibold",
                  step.complete ? "bg-green-100 text-green-700" : isNext ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-600"
                )}
                aria-hidden="true"
              >
                {step.complete ? <IconCheck className="w-3.5 h-3.5" /> : i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className={clsx("text-sm font-medium", step.complete ? "text-gray-600" : "text-gray-900")}>
                  {step.title}
                  {step.complete && <span className="sr-only"> (done)</span>}
                </div>
                <div className="text-sm text-gray-600 mt-0.5">{step.complete ? step.done : step.todo}</div>
              </div>
              {!step.complete && (
                <Link to={step.action.to} className={clsx(isNext ? btnPrimary : btnSecondary, "shrink-0")}>
                  {step.action.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
