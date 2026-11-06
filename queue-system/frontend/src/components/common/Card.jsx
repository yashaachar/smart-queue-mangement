import React from 'react';

export default function Card({
  children,
  title,
  subtitle,
  action,
  hoverable = false,
  className = '',
  ...props
}) {
  return (
    <div
      className={`card ${hoverable ? 'card-hover' : ''} ${className}`}
      {...props}
    >
      {(title || action) && (
        <div className="card-header">
          <div>
            {title && <h3 className="card-title">{title}</h3>}
            {subtitle && <p className="stat-helper" style={{ marginTop: '0.2rem' }}>{subtitle}</p>}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
