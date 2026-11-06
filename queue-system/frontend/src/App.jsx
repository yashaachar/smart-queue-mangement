import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DisplayBoard from './pages/DisplayBoard';
import TakeTokenPage from './pages/TakeTokenPage';
import StaffDashboard from './pages/StaffDashboard';
import ActivityLogsPage from './pages/ActivityLogsPage';
import NotFoundPage from './pages/NotFoundPage';
import Spinner from './components/Spinner';

// Protect routes that require authentication
const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="loading-screen">
        <Spinner size="md" />
        <span>Authenticating session...</span>
      </div>
    );
  }
  return user ? children : <Navigate to="/login" replace />;
};

// Protect routes that require staff/admin role
const StaffRoute = ({ children }) => {
  const { user, loading, isStaff } = useAuth();
  if (loading) {
    return (
      <div className="loading-screen">
        <Spinner size="md" />
        <span>Verifying staff authorization...</span>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (!isStaff) return <Navigate to="/" replace />;
  return children;
};

const AppContent = () => {
  const location = useLocation();
  const isLandingPage = location.pathname === '/';

  return (
    <>
      <Navbar />
      <main className={isLandingPage ? 'main-content-full' : 'main-content'}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/display" element={<DisplayBoard />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/take-token"
            element={
              <PrivateRoute>
                <TakeTokenPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/staff"
            element={
              <StaffRoute>
                <StaffDashboard />
              </StaffRoute>
            }
          />
          <Route
            path="/staff/logs"
            element={
              <StaffRoute>
                <ActivityLogsPage />
              </StaffRoute>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
