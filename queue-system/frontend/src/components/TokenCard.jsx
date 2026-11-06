import React from 'react';
import Badge from './common/Badge';
import { Clock, CheckCircle, AlertCircle, ArrowRight } from 'lucide-react';

/**
 * TokenCard — Modern digital ticket token card
 */
export default function TokenCard({ token, showDetails = true }) {
  if (!token) return null;

  const statusConfig = {
    waiting: { variant: 'warning', label: 'Waiting', icon: Clock },
    calling: { variant: 'primary', label: 'Calling', icon: AlertCircle },
    serving: { variant: 'success', label: 'Now Serving', icon: ArrowRight },
    served: { variant: 'neutral', label: 'Completed', icon: CheckCircle },
    completed: { variant: 'neutral', label: 'Completed', icon: CheckCircle },
    skipped: { variant: 'danger', label: 'Skipped', icon: AlertCircle },
    cancelled: { variant: 'danger', label: 'Cancelled', icon: AlertCircle },
  };

  const currentStatus = statusConfig[token.status] || {
    variant: 'neutral',
    label: token.status,
    icon: Clock,
  };

  const StatusIcon = currentStatus.icon;

  return (
    <div className="token-card" style={{ borderLeftColor: `var(--${currentStatus.variant === 'neutral' ? 'border-focus' : currentStatus.variant})` }}>
      <div className="token-card-left">
        <div className="token-number">
          {token.token_code ? token.token_code : `#${token.token_number}`}
        </div>
        <div className="token-meta">
          <div>
            <Badge variant={currentStatus.variant} dot>
              <StatusIcon size={12} aria-hidden="true" style={{ marginRight: '0.2rem' }} />
              {currentStatus.label}
            </Badge>
          </div>
          {token.username && (
            <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text)' }}>
              {token.username}
            </span>
          )}
          {showDetails && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
              <span className="token-time">
                Issued: {new Date(token.issued_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              {token.served_at && (
                <span className="token-time">
                  Completed: {new Date(token.served_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
