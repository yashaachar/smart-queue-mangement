import React, { useState, useEffect, useCallback } from 'react';
import { getQueueStatus } from '../api/queue';
import Spinner from '../components/Spinner';

const POLL_INTERVAL_MS = 3000; // refresh every 3 seconds

export default function DisplayBoard() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await getQueueStatus();
      setStatus(res.data.data);
      setLastUpdated(new Date());
      setError('');
    } catch (err) {
      setError('Unable to reach the server. Retrying...');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  if (loading) {
    return (
      <div className="page-center">
        <Spinner size="lg" label="Loading queue status..." />
      </div>
    );
  }

  return (
    <div className="display-board">
      <div className="board-header">
        <h1 className="board-title">🏥 Queue Display Board</h1>
        {lastUpdated && (
          <span className="board-refresh">
            Last updated: {lastUpdated.toLocaleTimeString()}
          </span>
        )}
      </div>

      {error && <div className="board-error">{error}</div>}

      {status && (
        <>
          {/* Status badge */}
          <div className={`queue-status-badge ${status.isOpen ? 'open' : 'closed'}`}>
            {status.isOpen ? '🟢 Counter Open' : '🔴 Counter Closed'}
          </div>

          {/* Now serving — big prominent number */}
          <div className="now-serving-section">
            <p className="now-serving-label">NOW SERVING</p>
            <div className="now-serving-number">
              {status.currentServing > 0 ? (
                <span className="token-big">#{status.currentServing}</span>
              ) : (
                <span className="token-big token-empty">—</span>
              )}
            </div>
          </div>

          {/* Stats row */}
          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-value">{status.waitingCount}</span>
              <span className="stat-label">Waiting</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{status.servedCount}</span>
              <span className="stat-label">Served Today</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{status.lastTokenNumber}</span>
              <span className="stat-label">Tokens Issued</span>
            </div>
          </div>

          {status.waitingCount === 0 && status.currentServing === 0 && (
            <p className="board-empty-msg">No patients in queue right now.</p>
          )}
        </>
      )}
    </div>
  );
}
