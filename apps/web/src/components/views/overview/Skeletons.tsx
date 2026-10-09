import { UI } from '@ganju/ui';

/**
 * Placeholders for tool health and its drill-down, shaped like what they stand
 * in for — the same table columns, the same row boxes — so the data lands
 * where the placeholder was instead of reflowing the card or the modal.
 *
 * Widths vary per row: identical bars read as a graphic, uneven ones as text
 * that hasn't arrived.
 */

/** Rows for the health table's `<tbody>`, one cell per column. */
export const HealthRowsSkeleton = ({ rows = 5 }: { rows?: number }) => (
  <>
    {Array.from({ length: rows }).map((_, i) => (
      <tr key={i} className="health-row-skeleton" aria-hidden="true">
        <td>
          <span className="health-tool">
            <UI.Skeleton
              variant="text"
              width={90 + ((i * 37) % 60)}
              height={16}
            />
            <UI.Skeleton
              variant="text"
              width={70 + ((i * 23) % 50)}
              height={13}
            />
          </span>
        </td>
        <td className="num">
          <UI.Skeleton variant="text" width={24} height={16} />
        </td>
        <td className="num">
          <UI.Skeleton
            variant="text"
            width={i % 3 === 1 ? 64 : 16}
            height={16}
          />
        </td>
        <td className="num">
          <UI.Skeleton variant="text" width={52} height={16} />
        </td>
        <td>
          <UI.Skeleton variant="text" width={68} height={14} />
        </td>
        <td>
          {i % 2 === 1 ? (
            <UI.Skeleton variant="rounded" width={72} height={18} />
          ) : (
            <UI.Skeleton variant="text" width={12} height={14} />
          )}
        </td>
        <td className="health-chevron" />
      </tr>
    ))}
  </>
);

/** Items in the "most common errors" list. */
export const ErrorListSkeleton = ({ rows = 2 }: { rows?: number }) => (
  <ul className="health-list" aria-busy="true">
    {Array.from({ length: rows }).map((_, i) => (
      <li key={i} className="health-error is-skeleton">
        <UI.Skeleton variant="circular" width={16} height={16} />
        <span className="health-error-text">
          <UI.Skeleton variant="text" width={`${58 - i * 14}%`} height={16} />
        </span>
        <UI.Skeleton variant="text" width={22} height={16} />
        <UI.Skeleton variant="text" width={64} height={14} />
      </li>
    ))}
  </ul>
);

/** Items in the "unused" list. */
export const UnusedListSkeleton = ({ rows = 2 }: { rows?: number }) => (
  <ul className="health-list" aria-busy="true">
    {Array.from({ length: rows }).map((_, i) => (
      <li key={i} className="health-unused">
        <UI.Skeleton variant="text" width={110 + i * 30} height={16} />
        <span className="health-muted">
          <UI.Skeleton variant="text" width={96} height={13} />
        </span>
        <UI.Skeleton variant="rounded" width={76} height={30} />
      </li>
    ))}
  </ul>
);

/** One row of the calls list or the session timeline, in its bordered box. */
const RowSkeleton = ({ i, withTime }: { i: number; withTime?: boolean }) => (
  <li aria-hidden="true">
    <div className="health-row is-skeleton">
      {withTime && <UI.Skeleton variant="text" width={86} height={14} />}
      <span className="health-row-main">
        <UI.Skeleton
          variant="text"
          width={`${46 + ((i * 17) % 30)}%`}
          height={16}
        />
        <UI.Skeleton
          variant="text"
          width={`${28 + ((i * 11) % 24)}%`}
          height={13}
        />
      </span>
      <UI.Skeleton variant="text" width={44} height={13} />
      {!withTime && <UI.Skeleton variant="text" width={64} height={13} />}
    </div>
  </li>
);

/** Rows of a tool's calls — also the one row "Load more" is fetching. */
export const CallRowsSkeleton = ({ rows = 5 }: { rows?: number }) => (
  <>
    {Array.from({ length: rows }).map((_, i) => (
      <RowSkeleton key={i} i={i} />
    ))}
  </>
);

/** A labelled block, the shape `UI.CopyableBlock` renders. */
const BlockSkeleton = ({
  label,
  height
}: {
  label: number;
  height: number;
}) => (
  <div className="health-block-skeleton">
    <UI.Skeleton variant="text" width={label} height={14} />
    <UI.Skeleton variant="rounded" width="100%" height={height} />
  </div>
);

/** One call: the meta line, arguments, result, and the session button. */
export const CallSkeleton = () => (
  <div className="health-skeleton-stack" aria-busy="true">
    <UI.Skeleton variant="text" width="52%" height={14} />
    <BlockSkeleton label={84} height={70} />
    <BlockSkeleton label={72} height={130} />
    <UI.Skeleton variant="rounded" width={128} height={30} />
  </div>
);

/** A session: who ran it, when, and its timeline. */
export const SessionSkeleton = ({ rows = 6 }: { rows?: number }) => (
  <div className="health-skeleton-stack" aria-busy="true">
    <div className="health-call-head">
      <UI.Skeleton variant="text" width={160} height={22} />
      <UI.Skeleton variant="text" width="78%" height={14} />
    </div>
    <ol className="health-timeline">
      {Array.from({ length: rows }).map((_, i) => (
        <RowSkeleton key={i} i={i} withTime />
      ))}
    </ol>
  </div>
);
