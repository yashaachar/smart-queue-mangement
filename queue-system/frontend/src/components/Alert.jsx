import React from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

/**
 * Alert — Modern dismissible notification banner
 * type: 'success' | 'error' | 'info' | 'warning'
 */
export default function Alert({ type = 'info', message, onDismiss, className = '' }) {
  if (!message) return null;

  const icons = {
    success: CheckCircle2,
    error: AlertCircle,
    warning: AlertTriangle,
    info: Info,
  };

  const Icon = icons[type] || Info;

  return (
    <div className={`alert alert-${type} ${className}`} role="alert">
      <div className="alert-content">
        <Icon size={18} aria-hidden="true" style={{ flexShrink: 0 }} />
        <span>{message}</span>
      </div>
      {onDismiss && (
        <button
          type="button"
          className="alert-close"
          onClick={onDismiss}
          aria-label="Dismiss alert"
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
}
