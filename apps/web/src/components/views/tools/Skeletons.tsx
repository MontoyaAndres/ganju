import { UI } from '@ganju/ui';

/**
 * Placeholders for the two list shapes this page renders before it knows what
 * is in them.
 *
 * They exist because the alternative is worse than a blank space: every list
 * here has an empty state that makes a claim — "No functions yet", "No
 * endpoints yet", "0 of 40 tools exposed" — and rendering that claim while the
 * request is still in flight tells the user something false about their own
 * server, then corrects it. A skeleton says the one true thing: this is a list,
 * and we are still finding out what is in it.
 *
 * Shaped like the rows they stand in for rather than being generic bars, so the
 * content lands where the placeholder was instead of reflowing the page under
 * whoever is reading it.
 */

/** Rows in a `tools-function-list` — a function, an endpoint. */
export const ToolRowsSkeleton = ({ rows = 3 }: { rows?: number }) => (
  <div className="tools-function-list" aria-busy="true">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="tools-function-item-skeleton">
        <div className="tools-function-item-skeleton-main">
          {/* Widths vary per row: three identical bars read as a graphic,
              while uneven ones read as text that hasn't arrived. */}
          <UI.Skeleton variant="text" width={`${34 + i * 9}%`} height={16} />
          <UI.Skeleton variant="text" width={`${62 - i * 7}%`} height={13} />
          <UI.Skeleton variant="rounded" width={120} height={14} />
        </div>
        <div className="tools-function-item-skeleton-actions">
          <UI.Skeleton variant="rounded" width={34} height={20} />
          <UI.Skeleton variant="circular" width={22} height={22} />
          <UI.Skeleton variant="circular" width={22} height={22} />
        </div>
      </div>
    ))}
  </div>
);

/** The six-cell `tools-meta-grid` above the editor. */
export const MetaGridSkeleton = () => (
  <dl className="tools-meta-grid" aria-busy="true">
    {Array.from({ length: 6 }).map((_, i) => (
      <div key={i}>
        <dt>
          <UI.Skeleton variant="text" width={58} height={11} />
        </dt>
        <dd>
          <UI.Skeleton variant="text" width={i % 2 ? 92 : 64} height={15} />
        </dd>
      </div>
    ))}
  </dl>
);
