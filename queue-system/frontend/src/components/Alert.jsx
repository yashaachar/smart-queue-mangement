import React from 'react';

/**
 * Simple alert/banner component.
 * type: 'success' | 'error' | 'info' | 'warning'
 */
export default function Alert({ type = 'info', message, onDismiss }) {
  if (!message) return null;

  return (
    <div className={`alert alert-${type}`} role="alert">
      <span>{message}</span>
      {onDismiss && (
        <button className="alert-close" onClick={onDismiss} aria-label="Dismiss">
          ✕
        </button>
      )}
    </div>
  );
}
