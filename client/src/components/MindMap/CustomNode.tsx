import { useState, useRef, useEffect, memo } from 'react';
import { Handle, Position, NodeProps, useReactFlow } from '@xyflow/react';

export interface ReactionSummary {
  emoji: string;
  count: number;
  userReacted: boolean;
}

export interface CustomNodeData extends Record<string, unknown> {
  label: string;
  memo?: string;
  reactions?: ReactionSummary[];
  onLabelChange?: (id: string, label: string) => void;
  onMemoChange?: (id: string, memo: string) => void;
  onDelete?: (id: string) => void;
  onReact?: (id: string, emoji: string) => void;
  isAIGenerated?: boolean;
}

const EMOJI_OPTIONS = ['👍', '❤️', '😄', '🎉', '💡', '🤔'];

function CustomNode({ id, data, selected }: NodeProps) {
  const nodeData = data as CustomNodeData;
  const { setNodes } = useReactFlow();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(nodeData.label);
  const [showPicker, setShowPicker] = useState(false);
  const [showMemo, setShowMemo] = useState(false);
  const [memoValue, setMemoValue] = useState(nodeData.memo ?? '');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const memoRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setValue(nodeData.label); }, [nodeData.label]);
  useEffect(() => { setMemoValue(nodeData.memo ?? ''); }, [nodeData.memo]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  useEffect(() => { if (showMemo) memoRef.current?.focus(); }, [showMemo]);

  function commitEdit() {
    setEditing(false);
    const trimmed = value.trim() || '새 아이디어';
    setValue(trimmed);
    nodeData.onLabelChange?.(id, trimmed);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') commitEdit();
    if (e.key === 'Escape') { setValue(nodeData.label); setEditing(false); }
  }

  function handleMemoChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    setMemoValue(v);
    nodeData.onMemoChange?.(id, v);
  }

  function handleReact(emoji: string) {
    nodeData.onReact?.(id, emoji);
    setShowPicker(false);
  }

  async function handleAnalyze() {
    setAnalyzing(true);
    setAnalysis('');
    let accumulated = '';
    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ nodeContent: value, memo: memoValue }),
      });
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') break;
          try {
            const parsed = JSON.parse(payload);
            if (parsed.text) { accumulated += parsed.text; setAnalysis(accumulated); }
          } catch { /* 불완전한 청크 */ }
        }
      }
    } catch (e) {
      setAnalysis('분석 중 오류가 발생했습니다.');
    } finally {
      setAnalyzing(false);
    }
  }

  const reactions = nodeData.reactions ?? [];
  const hasReactions = reactions.some((r) => r.count > 0);
  const hasMemo = memoValue.trim().length > 0;

  return (
    <div className="relative">
      {/* ── 메인 노드 카드 ── */}
      <div
        className={`
          relative bg-white rounded-xl shadow-md px-4 py-3 min-w-[120px] max-w-[220px]
          border-2 transition-all select-none
          ${selected ? 'border-brand-500 shadow-brand-100 shadow-lg' : 'border-brand-500'}
          ${nodeData.isAIGenerated ? 'border-ai-300 bg-ai-50' : ''}
        `}
        onDoubleClick={() => setEditing(true)}
      >
        <Handle id="target-top"  type="target" position={Position.Top}  className="!w-2 !h-2 !bg-gray-400" />
        <Handle id="target-left" type="target" position={Position.Left} className="!w-2 !h-2 !bg-gray-400" />

        {/* 라벨 */}
        {editing ? (
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            className="w-full text-sm outline-none bg-transparent text-gray-800 text-center"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <div className="text-sm text-gray-800 text-center break-words leading-snug">
            {nodeData.isAIGenerated && <span className="text-ai-400 text-xs mr-1">✦</span>}
            {value}
          </div>
        )}

        {/* 리액션 카운트 */}
        {hasReactions && (
          <div className="flex flex-wrap gap-1 mt-2 justify-center">
            {reactions.filter((r) => r.count > 0).map((r) => (
              <button
                key={r.emoji}
                onClick={(e) => { e.stopPropagation(); handleReact(r.emoji); }}
                className={`
                  text-xs px-1.5 py-0.5 rounded-full border transition
                  ${r.userReacted
                    ? 'bg-brand-100 border-brand-300 text-brand-700'
                    : 'bg-gray-100 border-gray-200 text-gray-600 hover:border-brand-200'}
                `}
              >
                {r.emoji} {r.count}
              </button>
            ))}
          </div>
        )}

        {/* 삭제 버튼 */}
        {selected && nodeData.onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); nodeData.onDelete!(id); }}
            className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600 transition z-10"
          >
            ×
          </button>
        )}

        {/* 이모티콘 피커 토글 버튼 */}
        {selected && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowPicker((v) => !v); }}
            className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-white border border-gray-200 rounded-full px-2 py-0.5 text-xs text-gray-500 hover:border-brand-300 shadow-sm transition z-10"
          >
            😊
          </button>
        )}

        {/* ── 메모 토글 버튼 (우하단 고정) ── */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowMemo((v) => {
              const next = !v;
              // 메모가 열릴 때 이 노드를 최상단 레이어로, 닫힐 때 원복
              setNodes((nodes) => nodes.map((n) =>
                n.id === id ? { ...n, zIndex: next ? 9999 : 0 } : n
              ));
              return next;
            });
          }}
          title={showMemo ? '메모 접기' : '메모 펼치기'}
          className={`
            absolute -bottom-2 -right-2 w-6 h-6 rounded-full shadow border
            flex items-center justify-center text-xs transition z-10
            ${showMemo
              ? 'bg-yellow-300 border-yellow-400 text-yellow-800'
              : hasMemo
                ? 'bg-yellow-200 border-yellow-300 text-yellow-700 hover:bg-yellow-300'
                : 'bg-white border-gray-200 text-gray-400 hover:bg-yellow-50 hover:border-yellow-300'}
          `}
        >
          {hasMemo && !showMemo ? '📝' : '✏️'}
        </button>

        {/* 이모티콘 피커 팝업 */}
        {showPicker && (
          <div
            className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white border border-gray-200 rounded-xl shadow-lg px-2 py-1.5 flex gap-1 z-20"
            onClick={(e) => e.stopPropagation()}
          >
            {EMOJI_OPTIONS.map((emoji) => {
              const reacted = reactions.find((r) => r.emoji === emoji)?.userReacted;
              return (
                <button
                  key={emoji}
                  onClick={() => handleReact(emoji)}
                  className={`text-lg hover:scale-125 transition-transform rounded p-0.5 ${reacted ? 'bg-brand-100 scale-110' : ''}`}
                >
                  {emoji}
                </button>
              );
            })}
          </div>
        )}

        <Handle id="source-bottom" type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-gray-400" />
        <Handle id="source-right"  type="source" position={Position.Right}  className="!w-2 !h-2 !bg-gray-400" />
      </div>

      {/* ── 메모 글상자 (우하단에서 펼침) ── */}
      {showMemo && (
        <div
          className="nodrag nowheel absolute top-full right-0 mt-2 w-52 z-30"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* 말풍선 꼭지 */}
          <div className="absolute -top-1.5 right-4 w-3 h-3 bg-yellow-100 border-l border-t border-yellow-300 rotate-45" />

          <div className="bg-yellow-50 border border-yellow-300 rounded-xl rounded-tr-sm shadow-lg overflow-hidden">
            {/* 헤더 */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-yellow-100 border-b border-yellow-200">
              <span className="text-xs font-medium text-yellow-800">📝 메모</span>
              <button
                onClick={() => {
                  setShowMemo(false);
                  setNodes((nodes) => nodes.map((n) =>
                    n.id === id ? { ...n, zIndex: 0 } : n
                  ));
                }}
                className="text-yellow-600 hover:text-yellow-900 text-sm leading-none"
              >
                ×
              </button>
            </div>

            {/* textarea */}
            <textarea
              ref={memoRef}
              value={memoValue}
              onChange={handleMemoChange}
              placeholder="이 노드에 대한 메모를 입력하세요..."
              rows={4}
              className="w-full bg-yellow-50 text-xs text-gray-700 px-3 py-2 resize-none outline-none placeholder-yellow-400 leading-relaxed"
            />

            {/* 글자 수 + 분석 버튼 */}
            <div className="px-3 pb-2 flex items-center justify-between border-t border-yellow-200 pt-1.5">
              <button
                onClick={handleAnalyze}
                disabled={analyzing}
                className="btn-ai-expand px-3 py-1 text-xs flex items-center gap-1 disabled:opacity-50 rounded-lg"
              >
                {analyzing
                  ? <><span className="animate-spin text-xs">⟳</span> 분석 중...</>
                  : <>🔍 아이디어 분석</>}
              </button>
              <span className="text-yellow-500 text-xs">{memoValue.length}자</span>
            </div>

            {/* 분석 결과 */}
            {analysis && (
              <div className="mx-3 mb-3 bg-white border border-yellow-200 rounded-lg p-2.5 text-xs text-gray-700 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-brand-600">✦ AI 분석 결과</span>
                  <button
                    onClick={() => setAnalysis('')}
                    className="text-gray-400 hover:text-gray-600 text-xs"
                  >
                    ×
                  </button>
                </div>
                {analysis}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(CustomNode);
