import React from 'react';
import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="page-center">
      <div className="not-found">
        <h1 className="not-found-code">404</h1>
        <p className="not-found-msg">Page not found</p>
        <Link to="/" className="btn btn-primary">Go to Display Board</Link>
      </div>
    </div>
  );
}
