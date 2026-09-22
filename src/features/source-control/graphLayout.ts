import type { GitHistoryCommit } from "./api";

type Lane = { sha: string; color: number };
export type GraphEdge = { from: number; to: number; color: number; start: "top" | "node"; end: "node" | "bottom" };
export type GraphRow = { lane: number; color: number; width: number; edges: GraphEdge[] };
export type GraphState = { lanes: (Lane | null)[]; nextColor: number };

// A page carries its unresolved parent lanes into the next page. Existing rows never move.
export function appendGraph(commits: GitHistoryCommit[], previous: GraphState = { lanes: [], nextColor: 0 }) {
  let lanes = previous.lanes.map(lane => lane && { ...lane });
  let nextColor = previous.nextColor;
  const rows = commits.map(commit => {
    let lane = lanes.findIndex(item => item?.sha === commit.sha);
    const incoming = lane !== -1;
    if (lane === -1) {
      lane = lanes.indexOf(null);
      if (lane === -1) lane = lanes.length;
      lanes[lane] = { sha: commit.sha, color: nextColor++ };
    }
    const color = lanes[lane]!.color;
    const before = [...lanes];
    lanes[lane] = null;
    const edges: GraphEdge[] = [];
    if (incoming) edges.push({ from: lane, to: lane, color, start: "top", end: "node" });
    commit.parents.forEach((parent, index) => {
      let parentLane = lanes.findIndex(item => item?.sha === parent);
      if (parentLane === -1) {
        parentLane = index === 0 && !lanes[lane] ? lane : lanes.indexOf(null);
        if (parentLane === -1) parentLane = lanes.length;
        lanes[parentLane] = { sha: parent, color: index === 0 ? color : nextColor++ };
      }
      edges.push({ from: lane, to: parentLane, color: lanes[parentLane]!.color, start: "node", end: "bottom" });
    });
    before.forEach((item, index) => {
      if (!item || index === lane) return;
      const destination = lanes.findIndex(candidate => candidate?.sha === item.sha);
      if (destination !== -1) edges.push({ from: index, to: destination, color: item.color, start: "top", end: "bottom" });
    });
    const width = Math.max(before.length, lanes.length);
    while (lanes.length && lanes[lanes.length - 1] === null) lanes.pop();
    return { lane, color, width, edges };
  });
  return { rows, state: { lanes, nextColor } };
}
