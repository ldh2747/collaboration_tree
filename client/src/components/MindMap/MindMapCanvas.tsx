import { useCallback, useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import {
  ReactFlow, Background, Controls, MiniMap,
  addEdge, Connection, BackgroundVariant,
  NodeChange, EdgeChange, Node, Edge,
  applyNodeChanges, applyEdgeChanges,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import CustomNode, { CustomNodeData, ReactionSummary } from './CustomNode';
import AISidebar from '../AISidebar/AISidebar';
import RemoteCursors, { RemoteCursor, getUserColor } from './RemoteCursors';
import { YjsMindmapProvider } from '../../lib/yjsProvider';
import api from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { useAuthStore } from '../../store/authStore';

const nodeTypes = { custom: CustomNode };

interface DbReaction { nodeId: string; userId: string; emoji: string; }

function computeReactions(reactions: DbReaction[], currentUserId: string): ReactionSummary[] {
  const map: Record<string, { count: number; userReacted: boolean }> = {};
  for (const r of reactions) {
    if (!map[r.emoji]) map[r.emoji] = { count: 0, userReacted: false };
    map[r.emoji].count++;
    if (r.userId === currentUserId) map[r.emoji].userReacted = true;
  }
  return Object.entries(map).map(([emoji, v]) => ({ emoji, ...v }));
}

interface Props { mindmapId: string; }

export default function MindMapCanvas({ mindmapId }: Props) {
  const { token, user } = useAuthStore();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cursors, setCursors] = useState<Record<string, RemoteCursor>>({});

  const providerRef = useRef<YjsMindmapProvider | null>(null);
  const reactionsRef = useRef<Record<string, DbReaction[]>>({});
  const posTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const contentTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const cursorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // ── 핸들러 ────────────────────────────────────────────
  const handleLabelChange = useCallback((id: string, label: string) => {
    setNodes((prev) => prev.map((n) => n.id === id ? { ...n, data: { ...n.data, label } } : n));
    clearTimeout(contentTimers.current[id]);
    contentTimers.current[id] = setTimeout(() => {
      providerRef.current?.updateNodeContent(id, label);
    }, 400);
  }, []);

  const handleMemoChange = useCallback((id: string, memo: string) => {
    setNodes((prev) => prev.map((n) => n.id === id ? { ...n, data: { ...n.data, memo } } : n));
    clearTimeout(contentTimers.current[`memo_${id}`]);
    contentTimers.current[`memo_${id}`] = setTimeout(() => {
      providerRef.current?.updateNodeMemo(id, memo);
    }, 600);
  }, []);

  const handleDelete = useCallback((id: string) => {
    providerRef.current?.deleteNode(id);
    setSelectedNodeId(null);
  }, []);

  const handleReact = useCallback(async (nodeId: string, emoji: string) => {
    const userId = user?.id ?? '';
    const { data } = await api.post(`/mindmaps/${mindmapId}/nodes/${nodeId}/reactions`, { emoji });
    const current = reactionsRef.current[nodeId] ?? [];
    if (data.action === 'removed') {
      reactionsRef.current[nodeId] = current.filter((r) => !(r.userId === userId && r.emoji === emoji));
    } else if (data.action === 'updated') {
      reactionsRef.current[nodeId] = current.map((r) => r.userId === userId ? { ...r, emoji } : r);
    } else {
      reactionsRef.current[nodeId] = [...current, { nodeId, userId, emoji }];
    }
    setNodes((prev) => prev.map((n) => n.id === nodeId
      ? { ...n, data: { ...n.data, reactions: computeReactions(reactionsRef.current[nodeId], userId) } }
      : n
    ));
    getSocket().emit('reaction', {
      mindmapId, nodeId, userId, emoji, action: data.action,
    });
  }, [mindmapId, user]);

  function makeNodeData(content: string, reactions: DbReaction[], memo?: string): CustomNodeData {
    return {
      label: content,
      memo: memo ?? '',
      reactions: computeReactions(reactions, user?.id ?? ''),
      onLabelChange: handleLabelChange,
      onMemoChange: handleMemoChange,
      onDelete: handleDelete,
      onReact: handleReact,
    };
  }

  // ── Yjs Y.Map → React Flow 노드/엣지 변환 ────────────
  function syncFromYjs(yNodes: Y.Map<Y.Map<unknown>>, yEdges: Y.Map<Y.Map<unknown>>) {
    const rfNodes: Node[] = [];
    yNodes.forEach((yNode, id) => {
      rfNodes.push({
        id,
        type: 'custom',
        position: {
          x: (yNode.get('positionX') as number) ?? 0,
          y: (yNode.get('positionY') as number) ?? 0,
        },
        data: makeNodeData(
          (yNode.get('content') as string) ?? '',
          reactionsRef.current[id] ?? [],
          (yNode.get('memo') as string) ?? ''
        ),
      });
    });

    const rfEdges: Edge[] = [];
    yEdges.forEach((yEdge, id) => {
      rfEdges.push({
        id,
        source: yEdge.get('sourceId') as string,
        target: yEdge.get('targetId') as string,
        sourceHandle: (yEdge.get('sourceHandle') as string) || undefined,
        targetHandle: (yEdge.get('targetHandle') as string) || undefined,
      });
    });

    setNodes(rfNodes);
    setEdges(rfEdges);
  }

  // ── 초기화 ────────────────────────────────────────────
  useEffect(() => {
    if (!token || !user) return;

    const socket = getSocket();
    socket.auth = { token };
    socket.connect();
    socket.emit('join_room', { mindmapId, token });

    // Yjs Provider 생성
    const provider = new YjsMindmapProvider(socket, mindmapId, token);
    providerRef.current = provider;

    const { yNodes, yEdges, doc } = provider;

    // ── DB에서 리액션 로드 ──────────────────────────────
    api.get(`/mindmaps/${mindmapId}`)
      .then(({ data }) => {
        for (const node of data.nodes) {
          reactionsRef.current[node.id] = node.reactions ?? [];
        }
      })
      .catch(() => {})
      .finally(() => {
        setLoading(false);
        // 리액션 로드 완료 후 현재 Y.Doc 상태로 명시적 동기화
        // (yjs_state가 먼저 도착해서 reactions 없이 렌더됐을 경우 갱신)
        syncFromYjs(yNodes, yEdges);
      });

    // ── Y.Doc 변경 시 React 상태 동기화 ────────────────
    const onDocUpdate = () => syncFromYjs(yNodes, yEdges);
    doc.on('update', onDocUpdate);

    // ── yjs_state 수신 시 명시적 동기화 ────────────────
    // provider 리스너가 먼저 update를 적용한 뒤 이 리스너가 실행되므로
    // yNodes/yEdges에 최신 상태가 반영된 시점에 syncFromYjs 호출
    const onYjsState = ({ mindmapId: mId }: { mindmapId: string }) => {
      if (mId !== mindmapId) return;
      syncFromYjs(yNodes, yEdges);
    };
    socket.on('yjs_state', onYjsState);

    // ── 커서 수신 ──────────────────────────────────────
    socket.on('cursor_moved', (payload: { userId: string; displayName: string; x: number; y: number }) => {
      const color = getUserColor(payload.userId);
      setCursors((prev) => ({ ...prev, [payload.userId]: { ...payload, color } }));
      clearTimeout(posTimers.current[`cur_${payload.userId}`]);
      posTimers.current[`cur_${payload.userId}`] = setTimeout(() => {
        setCursors((prev) => { const next = { ...prev }; delete next[payload.userId]; return next; });
      }, 3000);
    });

    socket.on('user_left', ({ socketId }: { socketId: string }) => {
      setCursors((prev) => { const next = { ...prev }; delete next[socketId]; return next; });
    });

    // ── 리액션 수신 ────────────────────────────────────
    socket.on('reaction_updated', (payload: {
      nodeId: string; userId: string; emoji: string;
      action: 'added' | 'updated' | 'removed'; prevEmoji?: string;
    }) => {
      const { nodeId, userId, emoji, action, prevEmoji } = payload;
      const current = reactionsRef.current[nodeId] ?? [];
      if (action === 'removed') {
        reactionsRef.current[nodeId] = current.filter((r) => !(r.userId === userId && r.emoji === emoji));
      } else if (action === 'updated' && prevEmoji) {
        reactionsRef.current[nodeId] = current.map((r) => r.userId === userId && r.emoji === prevEmoji ? { ...r, emoji } : r);
      } else if (action === 'added' && !current.find((r) => r.userId === userId && r.emoji === emoji)) {
        reactionsRef.current[nodeId] = [...current, { nodeId, userId, emoji }];
      }
      setNodes((prev) => prev.map((n) => n.id === nodeId
        ? { ...n, data: { ...n.data, reactions: computeReactions(reactionsRef.current[nodeId], user.id) } }
        : n
      ));
    });

    return () => {
      doc.off('update', onDocUpdate);
      socket.off('yjs_state', onYjsState);
      socket.off('cursor_moved');
      socket.off('user_left');
      socket.off('reaction_updated');
      socket.emit('leave_room', { mindmapId });
      provider.destroy();
      socket.disconnect();
    };
  }, [mindmapId, token, user?.id]);

  // 핸들러 최신화 (useCallback 참조 변경 시)
  useEffect(() => {
    setNodes((prev) => prev.map((n) => ({
      ...n,
      data: { ...n.data, onLabelChange: handleLabelChange, onMemoChange: handleMemoChange, onDelete: handleDelete, onReact: handleReact },
    })));
  }, [handleLabelChange, handleMemoChange, handleDelete, handleReact]);

  // ── 드래그 → 위치 저장 ────────────────────────────────
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((prev) => applyNodeChanges(changes, prev));
    changes.forEach((change) => {
      if (change.type === 'position' && !change.dragging && change.position) {
        const { id, position } = change;
        clearTimeout(posTimers.current[id]);
        posTimers.current[id] = setTimeout(() => {
          providerRef.current?.updateNodePosition(id, position.x, position.y);
        }, 200);
      }
    });
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((prev) => applyEdgeChanges(changes, prev));
    changes.forEach((change) => {
      if (change.type === 'remove') providerRef.current?.deleteEdge(change.id);
    });
  }, []);

  const onConnect = useCallback((connection: Connection) => {
    const id = crypto.randomUUID();
    setEdges((prev) => addEdge({ ...connection, id }, prev));
    providerRef.current?.addEdge(id, connection.source!, connection.target!);
  }, []);

  // ── 노드 추가 (parentId 지정 시 간선 자동 연결) ──────
  async function handleAddNode(
    content = '새 아이디어',
    position?: { x: number; y: number },
    parentId?: string,
  ): Promise<string> {
    const id = crypto.randomUUID();
    const pos = position ?? { x: 200 + Math.random() * 200, y: 200 + Math.random() * 200 };
    reactionsRef.current[id] = [];
    providerRef.current?.addNode(id, content, pos.x, pos.y, user?.id ?? '');
    if (parentId) {
      const edgeId = crypto.randomUUID();
      providerRef.current?.addEdge(edgeId, parentId, id, 'source-right', 'target-left');
    }
    return id;
  }

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => setSelectedNodeId(node.id), []);
  const onPaneClick = useCallback(() => setSelectedNodeId(null), []);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!user || cursorTimer.current) return;
    cursorTimer.current = setTimeout(() => { cursorTimer.current = null; }, 50);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    getSocket().emit('cursor_move', {
      mindmapId, userId: user.id, displayName: user.displayName,
      x: e.clientX - rect.left, y: e.clientY - rect.top,
    });
  }, [mindmapId, user]);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  if (loading) return (
    <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">불러오는 중...</div>
  );

  return (
    <div className="w-full h-full flex">
      <div className="flex-1 relative" ref={canvasRef} onMouseMove={onMouseMove}>
        <RemoteCursors cursors={Object.values(cursors)} />
        <ReactFlow
          nodes={nodes} edges={edges} nodeTypes={nodeTypes}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          onConnect={onConnect} onNodeClick={onNodeClick} onPaneClick={onPaneClick}
          fitView deleteKeyCode="Delete"
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
          <Controls />
          <MiniMap nodeColor={() => '#124633'} />
        </ReactFlow>
        <button
          onClick={() => handleAddNode()}
          className="absolute bottom-6 right-6 bg-brand-500 text-white rounded-full px-5 py-3 shadow-lg hover:bg-brand-600 transition font-semibold z-10 text-sm"
        >
          + 노드 추가
        </button>
      </div>

      {selectedNode && (
        <AISidebar
          mindmapId={mindmapId} selectedNode={selectedNode}
          nodes={nodes} edges={edges}
          onAddNode={handleAddNode} onClose={() => setSelectedNodeId(null)}
        />
      )}
    </div>
  );
}
