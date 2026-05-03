import { useNavigate, useLocation } from "react-router-dom";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useAppStore } from "@/store/appStore";
import Icon from "@/components/Icon";
import { cn } from "@/lib/cn";

/**
 * Dropdown that lets the user jump between classes from inside the in-class
 * chrome — supports the "I have N periods in one classroom" workflow that
 * Phase 4.5b's Duplicate room action builds toward. Pure navigation; no data
 * linking.
 *
 * Behaviour:
 * - Trigger renders the current class's name plus a chevron when there are
 *   2+ classes. With a single class we fall back to a plain heading so the
 *   dropdown chrome doesn't suggest a choice that doesn't exist.
 * - Clicking another class navigates to the SAME sub-route on the picked
 *   class — i.e. if you're on `.../classes/A/room`, picking class B routes
 *   you to `.../classes/B/room`. Sub-route is parsed off the current URL so
 *   we don't have to thread it through props.
 */
interface Props {
  currentClassId: string;
  currentClassName: string;
}

const SUB_ROUTES = ["roster", "room", "history"] as const;
type SubRoute = (typeof SUB_ROUTES)[number];

export default function ClassSwitcher({ currentClassId, currentClassName }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const classes = useAppStore((s) => s.classes);

  // If there's only one class, render the name as a static heading. A
  // dropdown with one entry would be confusing UX.
  if (classes.length <= 1) {
    return (
      <h1 className="truncate text-base font-semibold text-ink" title={currentClassName}>
        {currentClassName}
      </h1>
    );
  }

  const currentSub = parseSubRoute(location.pathname);
  const others = classes
    .filter((c) => c.id !== currentClassId)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className={cn(
            "flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-base font-semibold text-ink",
            "hover:bg-ink/5 focus:outline-none focus:ring-2 focus:ring-accent-blue/30",
          )}
          title="Switch class"
        >
          <span className="truncate">{currentClassName}</span>
          <Icon name="chevron-down" size={14} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-50 max-h-72 min-w-[12rem] overflow-auto rounded-md border border-ink/15 bg-paper p-1 text-sm shadow-lift"
        >
          <DropdownMenu.Label className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
            Switch to
          </DropdownMenu.Label>
          {others.map((c) => (
            <DropdownMenu.Item
              key={c.id}
              className="flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1.5 outline-none data-[highlighted]:bg-ink/5"
              onSelect={() => navigate(`/classes/${c.id}/${currentSub}`)}
            >
              <span className="truncate">{c.name}</span>
              <span className="shrink-0 text-[10px] text-ink-muted">
                {c.students.length} student{c.students.length === 1 ? "" : "s"}
              </span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** Pull the sub-route segment from /classes/:id/:sub. Defaults to "roster"
 *  for any unexpected path so the switcher always lands somewhere valid. */
function parseSubRoute(pathname: string): SubRoute {
  const m = /^\/classes\/[^/]+\/([^/]+)/.exec(pathname);
  const seg = m?.[1];
  return SUB_ROUTES.includes(seg as SubRoute) ? (seg as SubRoute) : "roster";
}
