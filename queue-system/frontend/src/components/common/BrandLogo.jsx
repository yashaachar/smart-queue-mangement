import React from 'react';
import { Link } from 'react-router-dom';

/**
 * BrandLogo — Minimalist commercial identity for Quebee.
 * Clean modern wordmark + geometric queue/hex glyph.
 */
export default function BrandLogo({ size = 'md', link = true, showTagline = false }) {
  const iconSizes = {
    sm: { box: 26, stroke: 1.5, dot: 2.5 },
    md: { box: 32, stroke: 2, dot: 3.5 },
    lg: { box: 44, stroke: 2.5, dot: 5 },
  };

  const textSizes = {
    sm: '1rem',
    md: '1.25rem',
    lg: '1.75rem',
  };

  const currentIcon = iconSizes[size] || iconSizes.md;

  const content = (
    <div className="navbar-brand-wrap" style={{ cursor: link ? 'pointer' : 'default' }}>
      <div
        className="brand-icon-box"
        style={{
          width: currentIcon.box,
          height: currentIcon.box,
        }}
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 32 32"
          width="100%"
          height="100%"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Hexagonal Token Housing */}
          <path
            d="M16 5L25.5 10.5V21.5L16 27L6.5 21.5V10.5L16 5Z"
            stroke="#3B82F6"
            strokeWidth={currentIcon.stroke}
            strokeLinejoin="round"
          />
          {/* Intelligent Queue Pulse Dot */}
          <circle cx="16" cy="16" r={currentIcon.dot} fill="#F59E0B" />
          {/* Micro Queue Stream Pins */}
          <path
            d="M16 10V12M16 20V22M11 13.5L12.5 14.5M19.5 17.5L21 18.5"
            stroke="#93C5FD"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div className="brand-text-wrap">
        <span
          className="brand-name"
          style={{ fontSize: textSizes[size] || textSizes.md }}
        >
          Quebee
        </span>
        {showTagline && (
          <span className="brand-tagline-micro">Smart queues</span>
        )}
      </div>
    </div>
  );

  if (link) {
    return <Link to="/" style={{ textDecoration: 'none' }}>{content}</Link>;
  }

  return content;
}
