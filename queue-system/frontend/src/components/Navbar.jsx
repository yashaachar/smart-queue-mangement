import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, logout, isStaff } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (path) => location.pathname === path ? 'nav-link active' : 'nav-link';

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <Link to="/">🎫 Queue System</Link>
      </div>

      <div className="navbar-links">
        <Link to="/" className={isActive('/')}>Display Board</Link>

        {user && !isStaff && (
          <Link to="/take-token" className={isActive('/take-token')}>Take Token</Link>
        )}

        {isStaff && (
          <>
            <Link to="/staff" className={isActive('/staff')}>Staff Dashboard</Link>
            <Link to="/staff/logs" className={isActive('/staff/logs')}>Activity Logs</Link>
          </>
        )}
      </div>

      <div className="navbar-auth">
        {user ? (
          <div className="navbar-user">
            <span className="user-info">
              <span className={`role-badge role-${user.role}`}>{user.role}</span>
              {user.username}
            </span>
            <button onClick={handleLogout} className="btn btn-outline btn-sm">
              Logout
            </button>
          </div>
        ) : (
          <div className="navbar-auth-links">
            <Link to="/login" className="btn btn-outline btn-sm">Login</Link>
            <Link to="/register" className="btn btn-primary btn-sm">Register</Link>
          </div>
        )}
      </div>
    </nav>
  );
}
