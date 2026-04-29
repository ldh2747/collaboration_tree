interface Props {
  onLayout:        () => void;
  onPrune:         () => void;
  onMerge:         () => Promise<void>;
  onUndo:          () => void;
  canUndo:         boolean;
  loading:         string | null;
  showScores:      boolean;
  canShowScores:   boolean;
  onToggleScores:  () => void;
  scoreFilter:     { high: boolean; medium: boolean; low: boolean };
  allFilterActive: boolean;
  onFilterToggle:  (key: 'high' | 'medium' | 'low') => void;
  onFilterAll:     (on: boolean) => void;
}

export default function ToolbarActions({
  onLayout, onPrune, onMerge, onUndo, canUndo,
  loading, showScores, canShowScores, onToggleScores,
  scoreFilter, allFilterActive, onFilterToggle, onFilterAll,
}: Props) {
  const btnBase =
    'px-3 py-1.5 text-xs font-medium rounded-lg border transition shadow-sm whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed';
  const btnInactive = 'border-brand-500 text-brand-600 bg-white hover:bg-brand-50';

  const btn = (label: string, action: () => void, disabled = false) => (
    <button
      onClick={action}
      disabled={disabled || loading !== null}
      className={`${btnBase} ${btnInactive}`}
    >
      {loading === label ? '처리 중…' : label}
    </button>
  );

  const toggleBtn = (
    label: string,
    active: boolean,
    action: () => void,
    activeClass: string,
  ) => (
    <button
      key={label}
      onClick={action}
      disabled={loading !== null}
      className={`${btnBase} ${active ? activeClass : btnInactive}`}
    >
      {label}
    </button>
  );

  return (
    <div className="absolute top-3 left-3 z-10 flex gap-2 flex-wrap items-start">
      {btn('마인드맵 정리', onLayout)}
      {btn('간선 가지치기', onPrune)}

      {/* 중복 노드 삭제 + 점수 표시 + 필터 드롭다운 */}
      <div className="relative flex gap-1">
        {btn('중복 노드 삭제', () => { onMerge(); })}

        <button
          onClick={onToggleScores}
          disabled={!canShowScores || loading !== null}
          title={canShowScores ? '노드 유사도 점수를 새로 계산하여 표시/숨기기' : '노드가 2개 이상 필요합니다'}
          className={`${btnBase} ${
            showScores
              ? 'bg-brand-500 text-white border-brand-500 hover:bg-brand-600'
              : btnInactive
          }`}
        >
          {loading === '점수 표시' ? '처리 중…' : '점수 표시'}
        </button>

        {/* 슬라이드 다운 필터 패널 */}
        <div
          className={`absolute top-full right-0 mt-1 z-20 flex flex-col gap-1
            transition-all duration-200 origin-top
            ${showScores
              ? 'opacity-100 scale-y-100 pointer-events-auto'
              : 'opacity-0 scale-y-0 pointer-events-none'
            }`}
        >
          {toggleBtn('전체',      allFilterActive,   () => onFilterAll(!allFilterActive),   'bg-brand-500 text-white border-brand-500 hover:bg-brand-600')}
          {toggleBtn('높은 연관', scoreFilter.high,   () => onFilterToggle('high'),   'bg-orange-500 text-white border-orange-500 hover:bg-orange-600')}
          {toggleBtn('중간 연관', scoreFilter.medium, () => onFilterToggle('medium'), 'bg-yellow-400 text-white border-yellow-400 hover:bg-yellow-500')}
          {toggleBtn('낮은 연관', scoreFilter.low,    () => onFilterToggle('low'),    'bg-green-500 text-white border-green-500 hover:bg-green-600')}
        </div>
      </div>

      {btn('↩ 되돌리기', onUndo, !canUndo)}
    </div>
  );
}
