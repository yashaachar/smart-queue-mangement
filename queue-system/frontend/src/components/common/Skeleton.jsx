import React from 'react';

export default function Skeleton({
  width = '100%',
  height = '20px',
  borderRadius = 'var(--radius-sm)',
  className = '',
  style = {},
}) {
  return (
    <div
      className={`skeleton-pulse ${className}`}
      style={{
        width,
        height,
        borderRadius,
        backgroundColor: 'var(--border)',
        opacity: 0.6,
        animation: 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        ...style,
      }}
      aria-hidden="true"
    />
  );
}

