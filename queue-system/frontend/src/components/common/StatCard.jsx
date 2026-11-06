import React from 'react';

export default function StatCard({
  label,
  value,
  helper,
  icon: Icon,
  trend,
  className = '',
}) {
  return (
    <div className={`stat-card ${className}`}>
      <div className="stat-header">
        <span className="stat-label">{label}</span>
        {Icon && (
          <span className="stat-icon">
            <Icon size={18} aria-hidden="true" />
          </span>
        )}
      </div>
      <div className="stat-value">{value}</div>
      {(helper || trend) && (
        <div className="stat-helper" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          {trend && (
            <span
              style={{
                color: trend > 0 ? 'var(--success)' : 'var(--danger)',
                fontWeight: 600,
                fontSize: '0.75rem',
              }}
            >
              {trend > 0 ? `+${trend}%` : `${trend}%`}
            </span>
          )}
          {helper && <span>{helper}</span>}
        </div>
      )}
    </div>
  );
}

