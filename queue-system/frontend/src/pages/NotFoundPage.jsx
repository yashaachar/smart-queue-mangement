import React from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/common/Button';
import { ArrowLeft, Home } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <div className="page-center">
      <div className="not-found" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
        <h1 className="not-found-code" style={{ fontSize: '5rem', fontWeight: 800, color: 'var(--border-focus)', letterSpacing: '-0.05em' }}>
          404
        </h1>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>Page not found</h2>
        <p className="not-found-msg" style={{ color: 'var(--text-muted)', marginBottom: '1.75rem', maxWidth: 400, margin: '0 auto 1.75rem' }}>
          The page or queue view you are looking for doesn't exist or has moved.
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
          <Link to="/">
            <Button variant="primary" icon={Home}>
              Quebee Home
            </Button>
          </Link>
          <Link to="/display">
            <Button variant="secondary">
              Live Display
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
