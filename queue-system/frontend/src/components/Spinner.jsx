import React from 'react';

export default function Spinner({ size = 'md', label = 'Loading...' }) {
  return (
    <div className={`spinner spinner-${size}`} role="status" aria-label={label}>
      <div className="spinner-ring" />
    </div>
  );
}
