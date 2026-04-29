// Walker's Algorithm — 좌→우(Left-to-Right) 레이아웃
// 각 레벨의 x 시작점 = 이전 레벨 노드들의 최대 우측 끝 + GAP (동적 계산)
// 동일 입력 → 동일 출력 보장 (deterministic)

const COL_GAP     = 40;   // 레벨 사이 여백
const SIBLING_GAP = 60;   // 형제 노드 수직 간격
const NODE_H      = 50;   // 노드 높이 기준
const ROOT_X      = 80;
const ROOT_Y      = 80;
const FOREST_GAP  = 160;  // 독립 트리 수직 간격

export interface EdgeInput { sourceId: string; targetId: string; }
export interface NodePos  { x: number; y: number; }

/** 텍스트 내용 기반 노드 너비 추정 (한글 ~14px, ASCII ~8px) */
function estimateWidth(content: string): number {
  let w = 24; // 패딩
  for (const ch of content) {
    w += ch.charCodeAt(0) > 127 ? 14 : 8;
  }
  return Math.max(100, Math.min(260, w));
}

export function computeTreeLayout(
  nodeIds: string[],
  edges: EdgeInput[],
  nodeContents?: Map<string, string>, // 노드 내용 (너비 추정용)
): Map<string, NodePos> {
  if (nodeIds.length === 0) return new Map();

  const nodeSet = new Set(nodeIds);

  // children map & in-degree
  const children = new Map<string, string[]>();
  const inDeg    = new Map<string, number>();
  nodeIds.forEach(id => { children.set(id, []); inDeg.set(id, 0); });

  for (const e of edges) {
    if (!nodeSet.has(e.sourceId) || !nodeSet.has(e.targetId)) continue;
    children.get(e.sourceId)!.push(e.targetId);
    inDeg.set(e.targetId, (inDeg.get(e.targetId) ?? 0) + 1);
  }

  children.forEach(list => list.sort()); // 결정론적 정렬

  let roots = nodeIds.filter(id => (inDeg.get(id) ?? 0) === 0);
  if (roots.length === 0) roots = [nodeIds[0]];
  roots.sort();

  // ── Step 1: BFS로 각 노드의 깊이(depth) 계산 ──────────
  const depthOf = new Map<string, number>();
  const queue: string[] = [...roots];
  roots.forEach(r => depthOf.set(r, 0));
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const d   = depthOf.get(cur) ?? 0;
    for (const child of children.get(cur) ?? []) {
      if (!depthOf.has(child)) {
        depthOf.set(child, d + 1);
        queue.push(child);
      }
    }
  }
  // 미방문 노드 (사이클 등) 처리
  nodeIds.forEach(id => { if (!depthOf.has(id)) depthOf.set(id, 0); });

  // ── Step 2: 각 깊이의 최대 노드 너비 계산 ──────────────
  const maxWidthAtDepth = new Map<number, number>();
  nodeIds.forEach(id => {
    const d = depthOf.get(id) ?? 0;
    const w = estimateWidth(nodeContents?.get(id) ?? '');
    maxWidthAtDepth.set(d, Math.max(maxWidthAtDepth.get(d) ?? 0, w));
  });

  // ── Step 3: 깊이별 x 시작 위치 누적 계산 ───────────────
  // levelX[d] = 깊이 d 노드의 x 좌표
  const maxDepth = Math.max(...[...depthOf.values()]);
  const levelX: number[] = [0]; // depth 0은 0 (ROOT_X는 마지막에 일괄 오프셋)
  for (let d = 1; d <= maxDepth; d++) {
    levelX[d] = levelX[d - 1] + (maxWidthAtDepth.get(d - 1) ?? 120) + COL_GAP;
  }

  // ── Step 4: 서브트리 재귀 배치 (y축) ───────────────────
  const result  = new Map<string, NodePos>();
  let   offsetY = ROOT_Y;

  for (const root of roots) {
    const visited = new Set<string>();
    const { height } = layoutSubtree(root, offsetY, children, result, visited, levelX, depthOf);
    offsetY += height + FOREST_GAP;
  }

  // ROOT_X 오프셋 일괄 적용
  result.forEach((pos, id) => result.set(id, { x: pos.x + ROOT_X, y: pos.y }));

  return result;
}

function layoutSubtree(
  nodeId: string,
  topBound: number,
  children: Map<string, string[]>,
  result: Map<string, NodePos>,
  visited: Set<string>,
  levelX: number[],
  depthOf: Map<string, number>,
): { height: number } {
  if (visited.has(nodeId)) {
    const x = levelX[depthOf.get(nodeId) ?? 0] ?? 0;
    result.set(nodeId, { x, y: topBound + NODE_H / 2 });
    return { height: NODE_H };
  }
  visited.add(nodeId);

  const x       = levelX[depthOf.get(nodeId) ?? 0] ?? 0;
  const childIds = (children.get(nodeId) ?? []).filter(id => !visited.has(id));

  if (childIds.length === 0) {
    result.set(nodeId, { x, y: topBound + NODE_H / 2 });
    return { height: NODE_H };
  }

  let cur   = topBound;
  let total = 0;
  const childCenters: number[] = [];

  for (let i = 0; i < childIds.length; i++) {
    const { height } = layoutSubtree(childIds[i], cur, children, result, visited, levelX, depthOf);
    childCenters.push(result.get(childIds[i])!.y);
    cur   += height + (i < childIds.length - 1 ? SIBLING_GAP : 0);
    total += height + (i < childIds.length - 1 ? SIBLING_GAP : 0);
  }

  const nodeY = (childCenters[0] + childCenters[childCenters.length - 1]) / 2;
  result.set(nodeId, { x, y: nodeY });

  return { height: Math.max(total, NODE_H) };
}
