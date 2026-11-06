import React, { useState, useEffect, useCallback } from 'react';
import { getQueueStatus, advanceQueue, resetQueue, toggleQueue, getAllTokens } from '../api/queue';
import Alert from '../components/Alert';
import Spinner from '../components/Spinner';
import TokenCard from '../components/TokenCard';

export default function StaffDashboard() {
  const [queueStatus, setQueueStatus] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [statusRes, tokensRes] = await Promise.all([
        getQueueStatus(),
        getAllTokens(currentPage, statusFilter),
      ]);
      setQueueStatus(statusRes.data.data);
      setTokens(tokensRes.data.data.tokens);
      setPagination(tokensRes.data.data.pagination);
    } catch (err) {
      setError('Failed to load dashboard data.');
    } finally {
      setLoading(false);
    }
  }, [currentPage, statusFilter]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(() => {
      getQueueStatus()
        .then((res) => setQueueStatus(res.data.data))
        .catch(() => {});
    }, 4000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const handleAction = async (actionFn, actionName, successMsg) => {
    setActionLoading(actionName);
    setError('');
    setSuccess('');
    try {
      const res = await actionFn();
      setSuccess(res.data.message || successMsg);
      await fetchAll();
    } catch (err) {
      setError(err.response?.data?.message || `${actionName} failed.`);
    } finally {
      setActionLoading('');
    }
  };

  const handleNext = () => handleAction(advanceQueue, 'next', 'Queue advanced');
  const handleToggle = () => handleAction(toggleQueue, 'toggle', 'Queue toggled');
  const handleReset = async () => {
    setShowResetConfirm(false);
    handleAction(resetQueue, 'reset', 'Queue reset successfully');
  };

  if (loading) {
    return (
      <div className="page-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="staff-dashboard">
      <h1 className="page-title">Staff Dashboard</h1>

      <Alert type="success" message={success} onDismiss={() => setSuccess('')} />
      <Alert type="error" message={error} onDismiss={() => setError('')} />

      {/* ── Queue Status Panel ── */}
      {queueStatus && (
        <div className="status-panel">
          <div className={`status-indicator ${queueStatus.isOpen ? 'open' : 'closed'}`}>
            {queueStatus.isOpen ? '🟢 Open' : '🔴 Closed'}
          </div>
          <div className="status-stats">
            <div className="stat-box">
              <span className="stat-val">{queueStatus.currentServing || '—'}</span>
              <span className="stat-lbl">Now Serving</span>
            </div>
            <div className="stat-box">
              <span className="stat-val">{queueStatus.waitingCount}</span>
              <span className="stat-lbl">Waiting</span>
            </div>
            <div className="stat-box">
              <span className="stat-val">{queueStatus.servedCount}</span>
              <span className="stat-lbl">Served</span>
            </div>
            <div className="stat-box">
              <span className="stat-val">{queueStatus.totalIssued}</span>
              <span className="stat-lbl">Total Issued</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Action Buttons ── */}
      <div className="action-buttons">
        <button
          className="btn btn-success btn-lg"
          onClick={handleNext}
          disabled={!!actionLoading || !queueStatus?.isOpen || queueStatus?.waitingCount === 0}
        >
          {actionLoading === 'next' ? <Spinner size="sm" /> : '▶ Call Next Token'}
        </button>

        <button
          className={`btn btn-lg ${queueStatus?.isOpen ? 'btn-warning' : 'btn-primary'}`}
          onClick={handleToggle}
          disabled={!!actionLoading}
        >
          {actionLoading === 'toggle'
            ? <Spinner size="sm" />
            : queueStatus?.isOpen ? '⏸ Close Counter' : '▶ Open Counter'}
        </button>

        <button
          className="btn btn-danger btn-lg"
          onClick={() => setShowResetConfirm(true)}
          disabled={!!actionLoading}
        >
          🔄 Reset Queue
        </button>
      </div>

      {/* ── Reset Confirmation Modal ── */}
      {showResetConfirm && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <h2>⚠️ Reset Queue?</h2>
            <p>This will delete all tokens and reset the counter to zero. This cannot be undone.</p>
            <div className="modal-actions">
              <button className="btn btn-danger" onClick={handleReset}>
                Yes, Reset
              </button>
              <button className="btn btn-outline" onClick={() => setShowResetConfirm(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Token List ── */}
      <div className="token-list-section">
        <div className="token-list-header">
          <h2>All Tokens</h2>
          <div className="filter-group">
            <label htmlFor="status-filter">Filter:</label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
              className="form-input form-input-sm"
            >
              <option value="">All</option>
              <option value="waiting">Waiting</option>
              <option value="serving">Serving</option>
              <option value="served">Served</option>
            </select>
          </div>
        </div>

        {tokens.length === 0 ? (
          <p className="empty-list">No tokens found.</p>
        ) : (
          <div className="token-grid">
            {tokens.map((token) => (
              <TokenCard key={token.id} token={token} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.pages > 1 && (
          <div className="pagination">
            <button
              className="btn btn-outline btn-sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              ← Prev
            </button>
            <span className="page-info">
              Page {currentPage} of {pagination.pages}
            </span>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => setCurrentPage((p) => Math.min(pagination.pages, p + 1))}
              disabled={currentPage === pagination.pages}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
