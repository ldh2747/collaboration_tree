import { useState, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      setAuth(data.user, data.token);
      navigate('/dashboard', { replace: true });
    } catch {
      setError('이메일 또는 비밀번호가 올바르지 않습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-xl shadow w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-6 text-center">로그인</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400"
            required
          />
          <input
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400"
            required
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-500 text-white rounded-lg py-2 font-semibold hover:bg-brand-600 transition disabled:opacity-50"
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-gray-500">
          계정이 없으신가요?{' '}
          <Link to="/register" className="text-brand-500 hover:underline">
            회원가입
          </Link>
        </p>
      </div>
    </div>
  );
}
