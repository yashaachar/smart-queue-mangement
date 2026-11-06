import React from 'react';
import Spinner from '../Spinner';

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  disabled = false,
  icon: Icon,
  type = 'button',
  onClick,
  className = '',
  ...props
}) {
  const sizeClass = `btn-${size}`;
  const variantClass = `btn-${variant}`;
  const widthClass = fullWidth ? 'btn-full' : '';

  return (
    <button
      type={type}
      className={`btn ${variantClass} ${sizeClass} ${widthClass} ${className}`}
      disabled={disabled || loading}
      onClick={onClick}
      {...props}
    >
      {loading ? (
        <Spinner size="sm" />
      ) : (
        <>
          {Icon && <Icon size={size === 'sm' ? 14 : size === 'lg' ? 18 : 16} aria-hidden="true" />}
          {children}
        </>
      )}
    </button>
  );
}

