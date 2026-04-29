// 간선 가지치기: Cross Edge 제거 + Transitive Reduction 통합
//
// Phase 1 — DFS 기반 Back/Cross Edge 제거
// Phase 2 — Transitive Reduction

export interface PruneEdge { id: string; sourceId: string; targetId: string; }

export function pruneEdges(
  nodeIds: string[],
  edges: PruneEdge[],
): Set<string> {
  const nodeSet = new Set(nodeIds);
  const valid   = edges.filter(e => nodeSet.has(e.sourceId) && nodeSet.has(e.targetId));
  const remove  = new Set<string>();

  const adj = new Map<string, Map<string, string>>();
  nodeIds.forEach(id => adj.set(id, new Map()));
  valid.forEach(e => adj.get(e.sourceId)!.set(e.targetId, e.id));

  // Phase 1: DFS
  const color = new Map<string, 0 | 1 | 2>();
  nodeIds.forEach(id => color.set(id, 0));

  function dfs(u: string) {
    color.set(u, 1);
    for (const [v, eid] of adj.get(u) ?? []) {
      const cv = color.get(v) ?? 0;
      if (cv === 1) {
        remove.add(eid); // Back edge (사이클)
      } else if (cv === 2) {
        remove.add(eid); // Cross edge
      } else {
        dfs(v);
      }
    }
    color.set(u, 2);
  }

  const inDeg = new Map<string, number>();
  nodeIds.forEach(id => inDeg.set(id, 0));
  valid.forEach(e => inDeg.set(e.targetId, (inDeg.get(e.targetId) ?? 0) + 1));
  const roots = [...nodeIds].sort().filter(id => (inDeg.get(id) ?? 0) === 0);

  for (const r of roots)    { if ((color.get(r) ?? 0) === 0) dfs(r); }
  for (const id of nodeIds) { if ((color.get(id) ?? 0) === 0) dfs(id); }

  // Phase 2: Transitive Reduction
  function canReach(start: string, target: string, skipFrom: string): boolean {
    const stack   = [start];
    const visited = new Set<string>([start]);
    while (stack.length > 0) {
      const cur = stack.pop()!;
      for (const [next, eid] of adj.get(cur) ?? []) {
        if (remove.has(eid)) continue;
        if (cur === skipFrom && next === target) continue;
        if (next === target) return true;
        if (!visited.has(next)) { visited.add(next); stack.push(next); }
      }
    }
    return false;
  }

  for (const e of valid) {
    if (remove.has(e.id)) continue;
    if (canReach(e.sourceId, e.targetId, e.sourceId)) remove.add(e.id);
  }

  return remove;
}
