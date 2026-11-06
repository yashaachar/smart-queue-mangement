import React from 'react';

/**
 * Displays a single token's details in a card.
 */
export default function TokenCard({ token }) {
  if (!token) return null;

  const statusColors = {
    waiting: '#f59e0b',
    serving: '#10b981',
    served: '#6b7280',
    skipped: '#ef4444',
  };

  const color = statusColors[token.status] || '#6b7280';

  return (
    <div className="token-card" style={{ borderLeftColor: color }}>
      <div className="token-number" style={{ color }}>
        #{token.token_number}
      </div>
      <div className="token-meta">
        <span className="token-status" style={{ backgroundColor: color }}>
          {token.status.toUpperCase()}
        </span>
        <span className="token-time">
          Issued: {new Date(token.issued_at).toLocaleTimeString()}
        </span>
        {token.served_at && (
          <span className="token-time">
            Served: {new Date(token.served_at).toLocaleTimeString()}
          </span>
        )}
      </div>
    </div>
  );
}
