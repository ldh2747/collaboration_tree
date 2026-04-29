import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import MindMapCanvas from '../components/MindMap/MindMapCanvas';
import api from '../lib/api';

export default function MapPage() {
  const { id } = useParams<{ id: string }>();
  const [title, setTitle] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteStatus, setInviteStatus] = useState<'idle' | 'ok' | 'err'>('idle');
  const [collaborators, setCollaborators] = useState<{ userId: string; role: string; user: { displayName: string; email: string } }[]>([]);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) return;
    api.get(`/mindmaps/${id}`).then(({ data }) => {
      setTitle(data.title);
      setTitleValue(data.title);
    });
    api.get(`/mindmaps/${id}/collaborators`).then(({ data }) => {
      setCollaborators(data);
    }).catch(() => {});
  }, [id]);

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus();
  }, [editingTitle]);

  async function commitTitle() {
    setEditingTitle(false);
    const trimmed = titleValue.trim() || title;
    setTitle(trimmed);
    await api.patch(`/mindmaps/${id}`, { title: trimmed });
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteStatus('idle');
    try {
      await api.post(`/mindmaps/${id}/collaborators`, { email: inviteEmail });
      setInviteStatus('ok');
      setInviteEmail('');
      const { data } = await api.get(`/mindmaps/${id}/collaborators`);
      setCollaborators(data);
    } catch {
      setInviteStatus('err');
    }
  }

  async function handleRemoveCollaborator(userId: string) {
    await api.delete(`/mindmaps/${id}/collaborators/${userId}`);
    setCollaborators((prev) => prev.filter((c) => c.userId !== userId));
  }

  if (!id) return <div>잘못된 접근입니다.</div>;

  return (
    <div className="w-screen h-screen flex flex-col">
      {/* 헤더 */}
      <header className="bg-white border-b border-brand-500 px-4 py-2 flex items-center gap-4 z-10 shrink-0">
        <Link to="/dashboard" className="text-brand-500 hover:underline text-sm shrink-0">
          ← 대시보드
        </Link>

        {/* 인라인 제목 편집 */}
        {editingTitle ? (
          <input
            ref={titleInputRef}
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => { if (e.key === 'Enter') commitTitle(); if (e.key === 'Escape') { setTitleValue(title); setEditingTitle(false); } }}
            className="text-sm font-semibold text-gray-800 border-b-2 border-brand-400 outline-none bg-transparent min-w-[120px] max-w-xs"
          />
        ) : (
          <button
            onClick={() => { setTitleValue(title); setEditingTitle(true); }}
            className="text-sm font-semibold text-gray-800 hover:text-brand-600 transition truncate max-w-xs"
            title="클릭하여 제목 편집"
          >
            {title || '제목 없음'}
            <span className="ml-1 text-gray-300 text-xs">✎</span>
          </button>
        )}

        <div className="flex-1" />

        {/* 협업자 아이콘 목록 */}
        <div className="flex -space-x-2">
          {collaborators.slice(0, 4).map((c) => (
            <div
              key={c.userId}
              title={c.user.displayName}
              className="w-7 h-7 rounded-full bg-brand-400 text-white text-xs flex items-center justify-center border-2 border-white font-semibold"
            >
              {c.user.displayName[0].toUpperCase()}
            </div>
          ))}
          {collaborators.length > 4 && (
            <div className="w-7 h-7 rounded-full bg-gray-200 text-gray-500 text-xs flex items-center justify-center border-2 border-white">
              +{collaborators.length - 4}
            </div>
          )}
        </div>

        {/* 초대 버튼 */}
        <button
          onClick={() => { setShowInvite((v) => !v); setInviteStatus('idle'); }}
          className="bg-brand-500 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-brand-600 transition font-medium shrink-0"
        >
          + 협업자 초대
        </button>
      </header>

      {/* 초대 패널 */}
      {showInvite && (
        <div className="absolute top-12 right-4 z-50 bg-white border border-gray-200 rounded-xl shadow-xl w-72 p-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-sm text-gray-700">협업자 초대</h3>
            <button onClick={() => setShowInvite(false)} className="text-gray-400 hover:text-gray-600">×</button>
          </div>

          <form onSubmit={handleInvite} className="flex gap-2 mb-3">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => { setInviteEmail(e.target.value); setInviteStatus('idle'); }}
              placeholder="이메일 입력"
              className="flex-1 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
              required
            />
            <button
              type="submit"
              className="bg-brand-500 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-brand-600 transition font-medium"
            >
              초대
            </button>
          </form>

          {inviteStatus === 'ok' && <p className="text-green-500 text-xs mb-2">초대 완료!</p>}
          {inviteStatus === 'err' && <p className="text-red-500 text-xs mb-2">해당 이메일을 찾을 수 없습니다.</p>}

          {collaborators.length > 0 && (
            <>
              <p className="text-xs text-gray-400 mb-2">현재 협업자</p>
              <ul className="space-y-1.5">
                {collaborators.map((c) => (
                  <li key={c.userId} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">{c.user.displayName}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">{c.role}</span>
                      <button
                        onClick={() => handleRemoveCollaborator(c.userId)}
                        className="text-gray-300 hover:text-red-400 text-xs transition"
                      >
                        ×
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <div className="flex-1 relative overflow-hidden">
        <MindMapCanvas mindmapId={id} />
      </div>
    </div>
  );
}
