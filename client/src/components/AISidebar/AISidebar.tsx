import { useState } from 'react';
import { Node, Edge } from '@xyflow/react';
import api from '../../lib/api';

interface Props {
  mindmapId: string;
  selectedNode: Node;
  nodes: Node[];
  edges: Edge[];
  onAddNode: (content: string, position?: { x: number; y: number }, parentId?: string) => Promise<string>;
  onClose: () => void;
}

export default function AISidebar({ selectedNode, nodes, edges, onAddNode, onClose }: Props) {
  const [ideas, setIdeas] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState<Set<number>>(new Set());
  const [error, setError] = useState('');
  const [count, setCount] = useState(5);

  const MIN_COUNT = 1;
  const MAX_COUNT = 10;

  const label = (selectedNode.data as { label: string }).label;

  // 상위 노드 체인 추출
  function getParentChain(): string {
    const chain: string[] = [];
    let currentId = selectedNode.id;
    for (let i = 0; i < 5; i++) {
      const parentEdge = edges.find((e) => e.target === currentId);
      if (!parentEdge) break;
      const parentNode = nodes.find((n) => n.id === parentEdge.source);
      if (!parentNode) break;
      chain.unshift((parentNode.data as { label: string }).label);
      currentId = parentNode.id;
    }
    return chain.join(' > ');
  }

  // 형제 노드 추출
  function getSiblingLabels(): string[] {
    return edges
      .filter((e) => e.target === selectedNode.id || e.source === selectedNode.id)
      .flatMap((e) => [e.source, e.target])
      .filter((id) => id !== selectedNode.id)
      .map((id) => nodes.find((n) => n.id === id))
      .filter(Boolean)
      .map((n) => (n!.data as { label: string }).label);
  }

  async function handleExpand() {
    setLoading(true);
    setIdeas([]);
    setAdded(new Set());
    setError('');

    // 로컬 변수로 누적 (stale closure 방지)
    let accumulated = '';

    try {
      const response = await fetch('/api/ai/expand', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          nodeContent: label,
          parentChain: getParentChain(),
          siblingNodes: getSiblingLabels(),
          count,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        setError(err.error ?? `서버 오류 (${response.status})`);
        return;
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') break;
          try {
            const chunk = JSON.parse(payload);
            if (chunk.error) { setError('AI 응답 오류: ' + chunk.error); return; }
            if (chunk.text) accumulated += chunk.text;
          } catch { /* 불완전한 청크 무시 */ }
        }
      }

      // 로컬 변수로 파싱 (stale closure 없음)
      const parsed = JSON.parse(accumulated);
      if (Array.isArray(parsed.ideas)) {
        setIdeas(parsed.ideas);
      } else {
        setError('응답 형식이 올바르지 않습니다.');
      }
    } catch (err) {
      console.error(err);
      setError('네트워크 오류 또는 API 키 문제입니다.');
    } finally {
      setLoading(false);
    }
  }

  async function handleAddIdea(idea: string, index: number) {
    const x = selectedNode.position.x + 250;
    const y = selectedNode.position.y + index * 80 - (ideas.length * 40);
    await onAddNode(idea, { x, y }, selectedNode.id);
    setAdded((prev) => new Set(prev).add(index));
  }

  async function handleAddAll() {
    for (let i = 0; i < ideas.length; i++) {
      if (!added.has(i)) await handleAddIdea(ideas[i], i);
    }
  }

  const isParsed = Array.isArray(ideas) && ideas.length > 0 && typeof ideas[0] === 'string' && !ideas[0].startsWith('{');

  return (
    <div className="w-72 bg-white border-l border-gray-200 flex flex-col shadow-lg">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-ai-500 text-lg">✦</span>
          <span className="font-semibold text-sm text-gray-700">AI 아이디어 확장</span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">
          ×
        </button>
      </div>

      {/* 선택된 노드 표시 */}
      <div className="px-4 py-3 bg-brand-50 border-b border-gray-100">
        <p className="text-xs text-gray-500 mb-1">선택된 노드</p>
        <p className="text-sm font-medium text-gray-800 truncate">{label}</p>
      </div>

      {/* 확장 버튼 + 갯수 조절 */}
      <div className="px-4 py-3 flex items-center gap-2">
        {/* 위아래 조절 버튼 */}
        <div className="flex flex-col gap-0.5 shrink-0">
          <button
            onClick={() => setCount((c) => Math.min(c + 1, MAX_COUNT))}
            disabled={loading || count >= MAX_COUNT}
            className="w-7 h-6 flex items-center justify-center rounded-t-md bg-gray-100 hover:bg-gray-200 disabled:opacity-30 transition text-gray-600 text-xs font-bold leading-none border border-gray-200"
            title="갯수 늘리기"
          >
            ▲
          </button>
          <button
            onClick={() => setCount((c) => Math.max(c - 1, MIN_COUNT))}
            disabled={loading || count <= MIN_COUNT}
            className="w-7 h-6 flex items-center justify-center rounded-b-md bg-gray-100 hover:bg-gray-200 disabled:opacity-30 transition text-gray-600 text-xs font-bold leading-none border border-t-0 border-gray-200"
            title="갯수 줄이기"
          >
            ▼
          </button>
        </div>

        {/* 생성 버튼 */}
        <button
          onClick={handleExpand}
          disabled={loading}
          className="btn-ai-expand flex-1 py-2 text-sm flex items-center justify-center gap-2"
        >
          {loading ? (
            <><span className="animate-spin">⟳</span> 생성 중...</>
          ) : (
            <>✦ 아이디어 {count}개 생성</>
          )}
        </button>
      </div>

      {/* 결과 */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {error && (
          <div className="text-xs text-red-500 bg-red-50 rounded-lg p-3 mb-2">{error}</div>
        )}

        {loading && !isParsed && (
          <div className="text-xs text-gray-400 text-center py-4 animate-pulse">
            LLM이 아이디어를 생각 중입니다...
          </div>
        )}

        {isParsed && (
          <>
            <div className="flex justify-between items-center mb-2">
              <p className="text-xs text-gray-500">제안된 아이디어</p>
              <button
                onClick={handleAddAll}
                className="text-xs text-ai-500 hover:text-ai-700 font-medium"
              >
                전체 추가
              </button>
            </div>
            <div className="space-y-2">
              {ideas.map((idea, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 p-2 rounded-lg border text-sm transition ${
                    added.has(i)
                      ? 'bg-green-50 border-green-200 text-green-700'
                      : 'bg-gray-50 border-gray-200 hover:border-ai-300'
                  }`}
                >
                  <span className="flex-1 leading-snug">{idea}</span>
                  <button
                    onClick={() => handleAddIdea(idea, i)}
                    disabled={added.has(i)}
                    className={`shrink-0 text-xs px-2 py-1 rounded font-medium transition ${
                      added.has(i)
                        ? 'bg-green-200 text-green-700 cursor-default'
                        : 'bg-ai-100 text-ai-600 hover:bg-ai-200'
                    }`}
                  >
                    {added.has(i) ? '✓' : '+'}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
