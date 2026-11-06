import React, { useState, useEffect, useCallback } from 'react';
import { getQueueStatus, advanceQueue, resetQueue, toggleQueue, getAllTokens } from '../api/queue';
import Alert from '../components/Alert';
import Spinner from '../components/Spinner';
import TokenCard from '../components/TokenCard';
import StatCard from '../components/common/StatCard';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import Badge from '../components/common/Badge';
import EmptyState from '../components/common/EmptyState';
import {
  Users,
  PlayCircle,
  PauseCircle,
  RotateCcw,
  CheckCircle2,
  Ticket,
  Filter,
  Monitor,
  AlertTriangle,
} from 'lucide-react';

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
      setError('Failed to load queue state from server.');
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

  const handleNext = () => handleAction(advanceQueue, 'next', 'Queue advanced to next customer');
  const handleToggle = () => handleAction(toggleQueue, 'toggle', 'Counter status updated');
  const handleReset = async () => {
    setShowResetConfirm(false);
    handleAction(resetQueue, 'reset', 'Session reset successfully');
  };

  if (loading) {
    return (
      <div className="page-center">
        <Spinner size="lg" label="Loading staff terminal..." />
      </div>
    );
  }

  return (
    <div className="staff-dashboard">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="page-title">Staff Operations Terminal</h1>
          <p className="page-subtitle">
            Counter 01 · Service Desk Dispatcher
          </p>
        </div>
        {queueStatus && (
          <Badge variant={queueStatus.isOpen ? 'success' : 'danger'} dot>
            {queueStatus.isOpen ? 'Counter Active' : 'Counter Suspended'}
          </Badge>
        )}
      </div>

      <Alert type="success" message={success} onDismiss={() => setSuccess('')} />
      <Alert type="error" message={error} onDismiss={() => setError('')} />

      {/* ── Status Metrics Grid ── */}
      {queueStatus && (
        <div className="stats-grid">
          <StatCard
            label="Now Serving"
            value={queueStatus.currentServing > 0 ? `#${queueStatus.currentServing}` : '—'}
            icon={Monitor}
            helper="Current at desk"
          />
          <StatCard
            label="In Waiting Line"
            value={queueStatus.waitingCount}
            icon={Users}
            helper="Pending service"
          />
          <StatCard
            label="Served Today"
            value={queueStatus.servedCount}
            icon={CheckCircle2}
            helper="Completed tokens"
          />
          <StatCard
            label="Total Tokens"
            value={queueStatus.totalIssued}
            icon={Ticket}
            helper="Issued this session"
          />
        </div>
      )}

      {/* ── Queue Control Action Buttons ── */}
      <div className="action-buttons">
        <Button
          variant="success"
          size="lg"
          onClick={handleNext}
          loading={actionLoading === 'next'}
          disabled={!!actionLoading || !queueStatus?.isOpen || queueStatus?.waitingCount === 0}
          icon={PlayCircle}
        >
          Call Next Customer
        </Button>

        <Button
          variant={queueStatus?.isOpen ? 'warning' : 'primary'}
          size="lg"
          onClick={handleToggle}
          loading={actionLoading === 'toggle'}
          disabled={!!actionLoading}
          icon={queueStatus?.isOpen ? PauseCircle : PlayCircle}
        >
          {queueStatus?.isOpen ? 'Suspend Counter' : 'Open Counter'}
        </Button>

        <Button
          variant="outline"
          size="lg"
          onClick={() => setShowResetConfirm(true)}
          disabled={!!actionLoading}
          icon={RotateCcw}
        >
          Reset Session
        </Button>
      </div>

      {/* ── Reset Confirmation Modal ── */}
      <Modal
        isOpen={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        title="Reset Queue Session?"
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowResetConfirm(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleReset}>
              Yes, Reset Session
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
          <AlertTriangle size={24} color="var(--danger)" style={{ flexShrink: 0, marginTop: '0.15rem' }} />
          <p className="modal-desc" style={{ margin: 0 }}>
            This will archive or clear the active waiting queue and reset the sequence counter back to zero.
            Please ensure all serving customers are completed before starting a new session.
          </p>
        </div>
      </Modal>

      {/* ── Token Management & Filter ── */}
      <div className="token-list-section">
        <div className="token-list-header">
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Queue Token Roster</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Live customer tokens ordered by issue time
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Filter size={15} color="var(--text-muted)" />
            <label htmlFor="status-filter" style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-muted)' }}>
              Filter:
            </label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="form-select"
              style={{ width: 'auto', padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
            >
              <option value="">All Statuses</option>
              <option value="waiting">Waiting Only</option>
              <option value="serving">Serving Only</option>
              <option value="served">Completed Only</option>
            </select>
          </div>
        </div>

        {tokens.length === 0 ? (
          <EmptyState
            title="No tokens found"
            description={statusFilter ? `No tokens match filter "${statusFilter}"` : 'No tokens have been issued in this queue session yet.'}
          />
        ) : (
          <div className="token-grid">
            {tokens.map((token) => (
              <TokenCard key={token.id} token={token} />
            ))}
          </div>
        )}

        {/* Pagination Controls */}
        {pagination && pagination.pages > 1 && (
          <div className="pagination">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              ← Previous
            </Button>
            <span className="page-info">
              Page {currentPage} of {pagination.pages} ({pagination.total} total)
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(pagination.pages, p + 1))}
              disabled={currentPage === pagination.pages}
            >
              Next →
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
