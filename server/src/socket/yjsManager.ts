import * as Y from 'yjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface Room {
  doc: Y.Doc;
  clientCount: number;
  saveTimer: ReturnType<typeof setTimeout> | null;
}

const rooms = new Map<string, Room>();

// ── 방 입장: Y.Doc 생성 또는 기존 반환 ───────────────────
export async function joinRoom(mindmapId: string): Promise<Y.Doc> {
  if (rooms.has(mindmapId)) {
    rooms.get(mindmapId)!.clientCount++;
    return rooms.get(mindmapId)!.doc;
  }

  const doc = new Y.Doc();
  const room: Room = { doc, clientCount: 1, saveTimer: null };
  rooms.set(mindmapId, room);

  // 최신 스냅샷 로드 시도
  const snapshot = await prisma.snapshot.findFirst({
    where: { mindmapId },
    orderBy: { createdAt: 'desc' },
  });

  if (snapshot) {
    Y.applyUpdate(doc, snapshot.yjsState as Uint8Array);
  } else {
    // DB 데이터를 Y.Doc으로 부트스트랩 (스냅샷 없을 때)
    const mindmap = await prisma.mindmap.findUnique({
      where: { id: mindmapId },
      include: { nodes: true, edges: true },
    });
    if (mindmap) {
      const yNodes = doc.getMap<Y.Map<unknown>>('nodes');
      const yEdges = doc.getMap<Y.Map<unknown>>('edges');
      doc.transact(() => {
        for (const n of mindmap.nodes) {
          const yNode = new Y.Map<unknown>();
          yNode.set('content', n.content);
          yNode.set('memo', n.memo ?? '');
          yNode.set('positionX', n.positionX);
          yNode.set('positionY', n.positionY);
          yNode.set('createdById', n.createdById);
          yNodes.set(n.id, yNode);
        }
        for (const e of mindmap.edges) {
          const yEdge = new Y.Map<unknown>();
          yEdge.set('sourceId', e.sourceId);
          yEdge.set('targetId', e.targetId);
          if (e.sourceHandle) yEdge.set('sourceHandle', e.sourceHandle);
          if (e.targetHandle) yEdge.set('targetHandle', e.targetHandle);
          yEdges.set(e.id, yEdge);
        }
      });
    }
  }

  // Y.Doc 변경 감지 → DB 동기화 (debounce 3초)
  attachDbSync(mindmapId, doc, room);

  return doc;
}

// ── 방 퇴장 ───────────────────────────────────────────────
export async function leaveRoom(mindmapId: string) {
  const room = rooms.get(mindmapId);
  if (!room) return;
  room.clientCount--;
  if (room.clientCount <= 0) {
    if (room.saveTimer) clearTimeout(room.saveTimer);
    // 디바운스 대기 중이던 변경사항까지 모두 DB에 즉시 반영
    await syncAllToDb(mindmapId);
    await saveSnapshot(mindmapId);
    room.doc.destroy();
    rooms.delete(mindmapId);
  }
}

// Y.Doc 전체 상태를 DB nodes/edges 테이블에 즉시 동기화
export async function syncAllToDb(mindmapId: string) {
  const room = rooms.get(mindmapId);
  if (!room) return;

  const yNodes = room.doc.getMap<Y.Map<unknown>>('nodes');
  const yEdges = room.doc.getMap<Y.Map<unknown>>('edges');

  const mindmap = await prisma.mindmap.findUnique({ where: { id: mindmapId } });
  if (!mindmap) return;

  // 노드 전체 upsert (memo 포함)
  const nodePromises: Promise<unknown>[] = [];
  yNodes.forEach((yNode, nodeId) => {
    nodePromises.push(
      prisma.node.upsert({
        where: { id: nodeId },
        create: {
          id: nodeId,
          mindmapId,
          content: (yNode.get('content') as string) ?? '',
          memo: (yNode.get('memo') as string) ?? '',
          positionX: (yNode.get('positionX') as number) ?? 0,
          positionY: (yNode.get('positionY') as number) ?? 0,
          createdById: (yNode.get('createdById') as string) ?? mindmap.ownerId,
        },
        update: {
          content: (yNode.get('content') as string) ?? '',
          memo: (yNode.get('memo') as string) ?? '',
          positionX: (yNode.get('positionX') as number) ?? 0,
          positionY: (yNode.get('positionY') as number) ?? 0,
        },
      })
    );
  });
  await Promise.all(nodePromises);

  // 엣지 전체 upsert (sourceHandle/targetHandle 포함, FK 보장 후)
  const edgePromises: Promise<unknown>[] = [];
  yEdges.forEach((yEdge, edgeId) => {
    edgePromises.push(
      prisma.edge.upsert({
        where: { id: edgeId },
        create: {
          id: edgeId,
          mindmapId,
          sourceId: yEdge.get('sourceId') as string,
          targetId: yEdge.get('targetId') as string,
          sourceHandle: (yEdge.get('sourceHandle') as string) || null,
          targetHandle: (yEdge.get('targetHandle') as string) || null,
        },
        update: {
          sourceHandle: (yEdge.get('sourceHandle') as string) || null,
          targetHandle: (yEdge.get('targetHandle') as string) || null,
        },
      }).catch(() => { /* FK 미충족 엣지는 무시 */ })
    );
  });
  await Promise.all(edgePromises);

  // DB에서 삭제된 노드/엣지 정리 (Y.Doc에 없는 항목 제거)
  const yNodeIds = Array.from(yNodes.keys());
  const yEdgeIds = Array.from(yEdges.keys());
  await prisma.node.deleteMany({ where: { mindmapId, id: { notIn: yNodeIds } } });
  await prisma.edge.deleteMany({ where: { mindmapId, id: { notIn: yEdgeIds } } });
}

// ── 업데이트 적용 + 브로드캐스트용 반환 ──────────────────
export function applyRemoteUpdate(mindmapId: string, update: Uint8Array): boolean {
  const room = rooms.get(mindmapId);
  if (!room) return false;
  Y.applyUpdate(room.doc, update, 'remote');
  return true;
}

export function getDoc(mindmapId: string): Y.Doc | null {
  return rooms.get(mindmapId)?.doc ?? null;
}

// ── DB 동기화 감시 ────────────────────────────────────────
function attachDbSync(mindmapId: string, doc: Y.Doc, room: Room) {
  const yNodes = doc.getMap<Y.Map<unknown>>('nodes');
  const yEdges = doc.getMap<Y.Map<unknown>>('edges');

  // 노드 추가/삭제 감지 → 즉시 DB 반영
  yNodes.observe((event) => {
    event.changes.keys.forEach(async (change, nodeId) => {
      try {
        if (change.action === 'add') {
          const yNode = yNodes.get(nodeId) as Y.Map<unknown>;
          const mindmap = await prisma.mindmap.findUnique({ where: { id: mindmapId } });
          if (!mindmap) return;
          await prisma.node.upsert({
            where: { id: nodeId },
            create: {
              id: nodeId,
              mindmapId,
              content: (yNode.get('content') as string) ?? '',
              memo: (yNode.get('memo') as string) ?? '',
              positionX: (yNode.get('positionX') as number) ?? 0,
              positionY: (yNode.get('positionY') as number) ?? 0,
              createdById: (yNode.get('createdById') as string) || mindmap.ownerId,
            },
            update: {},
          });
          console.log(`[yjsManager] node added to DB: ${nodeId}`);
        } else if (change.action === 'delete') {
          await prisma.node.deleteMany({ where: { id: nodeId } });
          console.log(`[yjsManager] node deleted from DB: ${nodeId}`);
        }
      } catch (err) {
        console.error(`[yjsManager] node observe error (${change.action} ${nodeId}):`, err);
      }
    });
  });

  // 노드 내용/위치/메모 변경 감지 (debounce 3초)
  yNodes.observeDeep((events) => {
    const changedNodeIds = new Set<string>();
    for (const event of events) {
      if (event.path.length >= 1) {
        changedNodeIds.add(event.path[0] as string);
      }
    }
    if (changedNodeIds.size === 0) return;
    scheduleSave(mindmapId, room, async () => {
      for (const nodeId of changedNodeIds) {
        const yNode = yNodes.get(nodeId) as Y.Map<unknown> | undefined;
        if (!yNode) continue;
        await prisma.node.updateMany({
          where: { id: nodeId },
          data: {
            content: (yNode.get('content') as string) ?? '',
            memo: (yNode.get('memo') as string) ?? '',
            positionX: (yNode.get('positionX') as number) ?? 0,
            positionY: (yNode.get('positionY') as number) ?? 0,
          },
        });
      }
    });
  });

  // 엣지 추가/삭제 감지 → 즉시 DB 반영
  yEdges.observe((event) => {
    event.changes.keys.forEach(async (change, edgeId) => {
      try {
        if (change.action === 'add') {
          const yEdge = yEdges.get(edgeId) as Y.Map<unknown>;
          const sourceId = yEdge.get('sourceId') as string;
          const targetId = yEdge.get('targetId') as string;
          const sourceHandle = (yEdge.get('sourceHandle') as string) || null;
          const targetHandle = (yEdge.get('targetHandle') as string) || null;
          // 노드가 DB에 저장될 때까지 최대 10회 재시도 (150ms 간격)
          await upsertEdgeWithRetry(edgeId, mindmapId, sourceId, targetId, sourceHandle, targetHandle);
          console.log(`[yjsManager] edge added to DB: ${edgeId}`);
        } else if (change.action === 'delete') {
          await prisma.edge.deleteMany({ where: { id: edgeId } });
          console.log(`[yjsManager] edge deleted from DB: ${edgeId}`);
        }
      } catch (err) {
        console.error(`[yjsManager] edge observe error (${change.action} ${edgeId}):`, err);
      }
    });
  });
}

// ── 스냅샷 저장 ───────────────────────────────────────────
async function saveSnapshot(mindmapId: string) {
  const room = rooms.get(mindmapId);
  if (!room) return;
  const state = Y.encodeStateAsUpdate(room.doc);
  await prisma.snapshot.create({
    data: { mindmapId, yjsState: Buffer.from(state) },
  });
  // 최신 3개만 유지
  const all = await prisma.snapshot.findMany({
    where: { mindmapId },
    orderBy: { createdAt: 'desc' },
  });
  if (all.length > 3) {
    await prisma.snapshot.deleteMany({
      where: { id: { in: all.slice(3).map((s) => s.id) } },
    });
  }
}

async function upsertEdgeWithRetry(
  edgeId: string,
  mindmapId: string,
  sourceId: string,
  targetId: string,
  sourceHandle: string | null,
  targetHandle: string | null,
  attempts = 10,
  delayMs = 150,
) {
  for (let i = 0; i < attempts; i++) {
    const [src, tgt] = await Promise.all([
      prisma.node.findUnique({ where: { id: sourceId } }),
      prisma.node.findUnique({ where: { id: targetId } }),
    ]);
    if (src && tgt) {
      await prisma.edge.upsert({
        where: { id: edgeId },
        create: { id: edgeId, mindmapId, sourceId, targetId, sourceHandle, targetHandle },
        update: { sourceHandle, targetHandle },
      });
      return;
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  console.warn(`[yjsManager] edge ${edgeId} skipped: nodes not found after ${attempts} retries`);
}

function scheduleSave(
  mindmapId: string,
  room: Room,
  fn: () => Promise<void>
) {
  if (room.saveTimer) clearTimeout(room.saveTimer);
  room.saveTimer = setTimeout(async () => {
    await fn();
    await saveSnapshot(mindmapId);
  }, 3000);
}
