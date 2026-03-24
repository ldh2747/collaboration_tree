import { memo } from 'react';

export interface RemoteCursor {
  userId: string;
  displayName: string;
  x: number;
  y: number;
  color: string;
}

const COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#8b5cf6', '#ec4899', '#14b8a6',
];

export function getUserColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

interface Props {
  cursors: RemoteCursor[];
}

function RemoteCursors({ cursors }: Props) {
  return (
    <>
      {cursors.map((cursor) => (
        <div
          key={cursor.userId}
          className="absolute pointer-events-none z-50 transition-all duration-75"
          style={{ left: cursor.x, top: cursor.y }}
        >
          {/* 커서 화살표 */}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M1 1L6.5 14L9 9L14 6.5L1 1Z"
              fill={cursor.color}
              stroke="white"
              strokeWidth="1"
            />
          </svg>
          {/* 이름 태그 */}
          <div
            className="mt-0.5 ml-3 px-1.5 py-0.5 rounded text-white text-xs font-medium whitespace-nowrap shadow"
            style={{ backgroundColor: cursor.color }}
          >
            {cursor.displayName}
          </div>
        </div>
      ))}
    </>
  );
}

export default memo(RemoteCursors);
