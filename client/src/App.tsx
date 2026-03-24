import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import MapPage from './pages/MapPage';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { token, initialized } = useAuthStore();
  if (!initialized) return null;
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { token, initialized } = useAuthStore();
  if (!initialized) return null;
  return !token ? <>{children}</> : <Navigate to="/dashboard" replace />;
}

export default function App() {
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
        <Route
          path="/dashboard"
          element={<PrivateRoute><DashboardPage /></PrivateRoute>}
        />
        <Route
          path="/map/:id"
          element={<PrivateRoute><MapPage /></PrivateRoute>}
        />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
