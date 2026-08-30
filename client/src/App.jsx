import React, { useState, useEffect, createContext, useContext } from 'react';
import { Routes, Route, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { Login } from './pages/Login';
import { CustomerDashboard } from './pages/CustomerDashboard';
import { StaffDashboard } from './pages/StaffDashboard';
import { AdminDashboard } from './pages/AdminDashboard';
import { MovieList } from './pages/MovieList';
import { ShowDetails } from './pages/ShowDetails';
import { BookingFlow } from './pages/BookingFlow';
import { CaseDetails } from './pages/CaseDetails';
import { Header } from './components/Header';
import { LoadingScreen } from './components/LoadingScreen';
import { api } from './lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('mtbm_user');
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        localStorage.removeItem('mtbm_user');
      }
    }
    setLoading(false);
  }, []);

  const login = (userData) => {
    setUser(userData);
    localStorage.setItem('mtbm_user', JSON.stringify(userData));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('mtbm_user');
  };

  if (loading) return <LoadingScreen />;

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

function PrivateRoute({ children, allowedRoles }) {
  const { user } = useAuth();
  const navigate = useNavigate();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    navigate(getDefaultRoute(user.role), { replace: true });
    return null;
  }

  return children;
}

function getDefaultRoute(role) {
  switch (role) {
    case 'customer': return '/movies';
    case 'staff': return '/staff';
    case 'admin': return '/admin';
    default: return '/login';
  }
}

function PublicRoute({ children }) {
  const { user } = useAuth();
  if (user) {
    return <Navigate to={getDefaultRoute(user.role)} replace />;
  }
  return children;
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      
      <Route element={
        <PrivateRoute>
          <Header />
          <main style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
            <Outlet />
          </main>
        </PrivateRoute>
      }>
        {/* Customer routes */}
        <Route path="/movies" element={<PrivateRoute allowedRoles={['customer', 'staff', 'admin']}><MovieList /></PrivateRoute>} />
        <Route path="/movies/:movieId/shows/:showId" element={<PrivateRoute allowedRoles={['customer', 'staff', 'admin']}><ShowDetails /></PrivateRoute>} />
        <Route path="/booking/:showId" element={<PrivateRoute allowedRoles={['customer']}><BookingFlow /></PrivateRoute>} />
        <Route path="/my-bookings" element={<PrivateRoute allowedRoles={['customer']}><CustomerDashboard /></PrivateRoute>} />
        <Route path="/booking/:caseId" element={<PrivateRoute allowedRoles={['customer', 'staff', 'admin']}><CaseDetails /></PrivateRoute>} />
        
        {/* Staff routes */}
        <Route path="/staff" element={<PrivateRoute allowedRoles={['staff', 'admin']}><StaffDashboard /></PrivateRoute>} />
        
        {/* Admin routes */}
        <Route path="/admin" element={<PrivateRoute allowedRoles={['admin']}><AdminDashboard /></PrivateRoute>} />
      </Route>

      <Route path="/" element={<Navigate to={user ? getDefaultRoute(user.role) : '/movies'} replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}