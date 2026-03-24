import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../lib/api';
import { MindmapMeta } from '../types';
import { useAuthStore } from '../store/authStore';

export default function DashboardPage() {
  const [mindmaps, setMindmaps] = useState<MindmapMeta[]>([]);
  const { user, clearAuth } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/mindmaps').then(({ data }) => setMindmaps(data));
  }, []);

  async function createNew() {
    const { data } = await api.post('/mindmaps', { title: '새 마인드맵' });
    navigate(`/map/${data.id}`);
  }

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.preventDefault();
    if (!confirm('삭제하시겠습니까?')) return;
    await api.delete(`/mindmaps/${id}`);
    setMindmaps((prev) => prev.filter((m) => m.id !== id));
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow px-6 py-4 flex justify-between items-center">
        <h1 className="text-xl font-bold text-brand-600">Collaboration Tree</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">{user?.displayName}</span>
          <button
            onClick={clearAuth}
            className="text-sm text-gray-500 hover:text-red-500 transition"
          >
            로그아웃
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold">내 마인드맵</h2>
          <button
            onClick={createNew}
            className="bg-brand-500 text-white px-4 py-2 rounded-lg hover:bg-brand-600 transition text-sm font-semibold"
          >
            + 새 마인드맵
          </button>
        </div>

        {mindmaps.length === 0 ? (
          <div className="text-center text-gray-400 py-20">
            마인드맵이 없습니다. 새로 만들어보세요!
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {mindmaps.map((m) => (
              <Link
                key={m.id}
                to={`/map/${m.id}`}
                className="bg-white rounded-xl shadow p-5 hover:shadow-md transition block group relative"
              >
                <h3 className="font-semibold text-gray-800 truncate pr-6">{m.title}</h3>
                <p className="text-xs text-gray-400 mt-2">
                  {new Date(m.updatedAt).toLocaleDateString('ko-KR')}
                </p>
                <button
                  onClick={(e) => handleDelete(e, m.id)}
                  className="absolute top-3 right-3 text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition text-lg leading-none"
                >
                  ×
                </button>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
