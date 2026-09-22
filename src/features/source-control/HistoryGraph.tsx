import { Virtuoso } from "react-virtuoso";
import { GitBranch, Tag } from "lucide-react";
import type { GitHistoryCommit } from "./api";
import type { GraphRow } from "./graphLayout";

const COLORS = ["#77b7f5", "#b3a0ee", "#78bea0", "#dfb877", "#e292ae", "#82cbd4"];
export function GraphCell({ row, width }: { row: GraphRow; width: number }) {
  const x = (lane: number) => 14 + lane * 16;
  return <svg width={width} height={38} aria-hidden="true" className="sc-graph-cell">
    {row.edges.map((edge, index) => {
      const y1 = edge.start === "top" ? 0 : 19;
      const y2 = edge.end === "bottom" ? 38 : 19;
      return <path key={index} d={`M ${x(edge.from)} ${y1} C ${x(edge.from)} ${(y1 + y2) / 2}, ${x(edge.to)} ${(y1 + y2) / 2}, ${x(edge.to)} ${y2}`}
        stroke={COLORS[edge.color % COLORS.length]} strokeWidth={1.6} fill="none" />;
    })}
    <circle cx={x(row.lane)} cy={19} r={3.7} fill={COLORS[row.color % COLORS.length]} stroke="var(--panel)" strokeWidth={1.5} />
  </svg>;
}

export function HistoryGraph({ commits, rows, selected, onSelect, onMore, hasMore, paging }: {
  commits: GitHistoryCommit[]; rows: GraphRow[]; selected: string | null;
  onSelect: (sha: string) => void; onMore: () => void;
  hasMore: boolean; paging: boolean;
}) {
  const width = Math.max(64, ...rows.map(row => row.width * 16 + 20));
  return <div className="sc-history-graph">
    <div className="sc-history-heading" style={{ gridTemplateColumns: `${width}px minmax(180px, 1fr) 130px 100px 80px` }}>
      <span>Graph</span><span>Commit</span><span>Author</span><span>Date</span><span>SHA</span>
    </div>
    <Virtuoso className="sc-commit-list" data={commits} fixedItemHeight={38}
      aria-label="Commit history" computeItemKey={(_, commit) => commit.sha}
      endReached={() => { if (hasMore && !paging) onMore(); }}
      itemContent={(index, commit) => <button type="button" className="sc-commit-row"
        style={{ gridTemplateColumns: `${width}px minmax(180px, 1fr) 130px 100px 80px` }}
        aria-pressed={selected === commit.sha} onClick={() => onSelect(commit.sha)}
        aria-label={`${commit.subject}, ${commit.author}, ${commit.sha.slice(0, 8)}`}>
        <GraphCell row={rows[index]} width={width} />
        <span className="sc-commit-subject" title={commit.subject}>
          {commit.refs.map(ref => <span className={`sc-ref${ref === "HEAD" ? " sc-head-ref" : ""}`} key={ref} title={ref}>
            {ref.startsWith("refs/tags/") ? <Tag size={10} /> : ref === "HEAD" ? null : <GitBranch size={10} />}
            {ref.replace(/^refs\/(heads|remotes|tags)\//, "")}
          </span>)}<span>{commit.subject}{commit.isShallowBoundary ? " · shallow boundary" : ""}</span>
        </span>
        <span title={commit.author}>{commit.author}</span>
        <time dateTime={commit.date} title={new Date(commit.date).toLocaleString()}>{new Date(commit.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</time>
        <code>{commit.sha.slice(0, 8)}</code>
      </button>}
      components={{ Footer: () => hasMore ? <button type="button" className="sc-load-more" onClick={onMore} disabled={paging}>{paging ? "Loading commits…" : "Load 100 more commits"}</button> : <div className="sc-history-end">End of available history</div> }} />
  </div>;
}
