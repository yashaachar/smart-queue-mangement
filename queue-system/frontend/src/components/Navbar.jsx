import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import BrandLogo from './common/BrandLogo';
import { Monitor, Ticket, LayoutDashboard, History, BarChart3, LogOut, LogIn, UserPlus } from 'lucide-react';

export default function Navbar() {
  const { user, logout, isStaff } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (path) => (location.pathname === path ? 'nav-link active' : 'nav-link');

  return (
    <nav className="navbar" role="navigation" aria-label="Main navigation">
      <BrandLogo size="md" showTagline={true} />

      <div className="navbar-links">
        <Link to="/" className={isActive('/')}>
          Overview
        </Link>
        <Link to="/display" className={isActive('/display')}>
          <Monitor size={15} aria-hidden="true" />
          <span>Live Board</span>
        </Link>

        {user && !isStaff && (
          <Link to="/take-token" className={isActive('/take-token')}>
            <Ticket size={15} aria-hidden="true" />
            <span>My Ticket</span>
          </Link>
        )}

        {isStaff && (
          <>
            <Link to="/staff" className={isActive('/staff')}>
              <LayoutDashboard size={15} aria-hidden="true" />
              <span>Staff Terminal</span>
            </Link>
            <Link to="/analytics" className={isActive('/analytics')}>
              <BarChart3 size={15} aria-hidden="true" />
              <span>Analytics</span>
            </Link>
            <Link to="/staff/logs" className={isActive('/staff/logs')}>
              <History size={15} aria-hidden="true" />
              <span>Audit Logs</span>
            </Link>
          </>
        )}
      </div>

      <div className="navbar-auth">
        {user ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <span className="user-badge">
              <span className={`role-badge role-${user.role}`}>{user.role}</span>
              <span>{user.username}</span>
            </span>
            <button
              onClick={handleLogout}
              className="btn btn-ghost btn-sm"
              title="Sign out of Quebee"
              aria-label="Logout"
            >
              <LogOut size={15} aria-hidden="true" />
              <span>Logout</span>
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Link to="/login" className="btn btn-outline btn-sm">
              <LogIn size={14} aria-hidden="true" />
              <span>Sign In</span>
            </Link>
            <Link to="/register" className="btn btn-primary btn-sm">
              <UserPlus size={14} aria-hidden="true" />
              <span>Create Account</span>
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
}
