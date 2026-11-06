import React, { useState, useEffect, useCallback } from 'react';
import {
  getQueueStatus,
  callNext,
  startServing,
  completeService,
  skipToken,
  resetQueue,
  toggleQueue,
  getAllTokens,
  getCounters,
  getServices,
  subscribeQueueStream,
} from '../api/queue';
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
  Play,
  SkipForward,
  CheckSquare,
  Timer,
  Clock,
  Layers,
} from 'lucide-react';

export default function StaffDashboard() {
  const [queueStatus, setQueueStatus] = useState(null);
  const [counters, setCounters] = useState([]);
  const [services, setServices] = useState([]);
  const [selectedCounterId, setSelectedCounterId] = useState(1);
  const [tokens, setTokens] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [serviceFilter, setServiceFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [elapsedServiceSeconds, setElapsedServiceSeconds] = useState(0);

  const fetchAll = useCallback(async () => {
    try {
      const [statusRes, countersRes, servicesRes, tokensRes] = await Promise.all([
        getQueueStatus(),
        getCounters(),
        getServices(),
        getAllTokens(currentPage, statusFilter, serviceFilter),
      ]);
      setQueueStatus(statusRes.data.data);
      setCounters(countersRes.data.data.counters);
      setServices(servicesRes.data.data.services);
      setTokens(tokensRes.data.data.tokens);
      setPagination(tokensRes.data.data.pagination);
    } catch (err) {
      setError('Failed to load queue operational state.');
    } finally {
      setLoading(false);
    }
  }, [currentPage, statusFilter, serviceFilter]);

  useEffect(() => {
    fetchAll();

    // Setup real-time SSE stream for instant counter and queue synchronization
    const unsubscribeSSE = subscribeQueueStream((data) => {
      setQueueStatus(data);
      getCounters().then((res) => setCounters(res.data.data.counters)).catch(() => {});
    });

    const interval = setInterval(() => {
      getQueueStatus()
        .then((res) => setQueueStatus(res.data.data))
        .catch(() => {});
      getCounters()
        .then((res) => setCounters(res.data.data.counters))
        .catch(() => {});
    }, 6000);

    return () => {
      unsubscribeSSE();
      clearInterval(interval);
    };
  }, [fetchAll]);

  // Find currently operated counter
  const activeCounter = counters.find((c) => c.id === selectedCounterId) || counters[0];

  // Timer for active service duration
  useEffect(() => {
    let timer = null;
    if (activeCounter?.status === 'serving' && activeCounter.started_at) {
      const startTime = new Date(activeCounter.started_at).getTime();
      const updateElapsed = () => {
        setElapsedServiceSeconds(Math.max(0, Math.floor((Date.now() - startTime) / 1000)));
      };
      updateElapsed();
      timer = setInterval(updateElapsed, 1000);
    } else {
      setElapsedServiceSeconds(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [activeCounter]);

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

  const handleCallNext = () => handleAction(() => callNext(selectedCounterId), 'call-next', 'Next customer called');
  const handleStartServing = () => handleAction(() => startServing(selectedCounterId), 'start-serving', 'Service consultation started');
  const handleComplete = () => handleAction(() => completeService(selectedCounterId), 'complete', 'Service completed successfully');
  const handleSkip = () => handleAction(() => skipToken(selectedCounterId), 'skip', 'Token marked as skipped');
  const handleToggle = () => handleAction(toggleQueue, 'toggle', 'Session dispatch toggled');
  const handleReset = async () => {
    setShowResetConfirm(false);
    handleAction(resetQueue, 'reset', 'Session archived and fresh session initialized');
  };

  const formatTimer = (totalSeconds) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="page-center">
        <Spinner size="lg" label="Loading staff dispatch terminal..." />
      </div>
    );
  }

  return (
    <div className="staff-dashboard">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="page-title">Staff Operations Terminal</h1>
          <p className="page-subtitle">
            Universal Service Desk Dispatcher & Multi-Counter Hub
          </p>
        </div>

        {queueStatus && (
          <Badge variant={queueStatus.isOpen ? 'success' : 'danger'} dot>
            {queueStatus.isOpen ? 'Queue Open for Check-in' : 'Queue Suspended'}
          </Badge>
        )}
      </div>

      <Alert type="success" message={success} onDismiss={() => setSuccess('')} />
      <Alert type="error" message={error} onDismiss={() => setError('')} />

      {/* ── Active Counter Terminal Bar ── */}
      <div className="card" style={{ marginBottom: '2rem', padding: '1.5rem', borderLeft: '4px solid var(--primary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Monitor size={22} color="var(--primary)" />
            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Your Station
              </span>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>
                {activeCounter ? activeCounter.name : 'Counter 01'}
              </h3>
            </div>
          </div>

          {/* Counter Switcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Switch Counter:</span>
            <select
              value={selectedCounterId}
              onChange={(e) => setSelectedCounterId(parseInt(e.target.value))}
              className="form-select"
              style={{ width: 'auto', padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
            >
              {counters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.status.toUpperCase()})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Counter Live State Box */}
        <div style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1.25rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
              <Badge variant={activeCounter?.status === 'serving' ? 'success' : activeCounter?.status === 'calling' ? 'primary' : 'neutral'} dot>
                {activeCounter?.status.toUpperCase()}
              </Badge>
              {activeCounter?.token_code && (
                <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--primary)' }}>
                  {activeCounter.token_code}
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              {activeCounter?.status === 'calling' && 'Customer called. Waiting for customer to arrive at counter.'}
              {activeCounter?.status === 'serving' && `Consultation in progress. Service Time: ${formatTimer(elapsedServiceSeconds)}`}
              {activeCounter?.status === 'idle' && 'Counter is clear and standing by for next customer.'}
            </div>
          </div>

          {/* Granular Lifecycle Action Controls */}
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            {(!activeCounter || activeCounter.status === 'idle') && (
              <Button
                variant="primary"
                size="md"
                onClick={handleCallNext}
                loading={actionLoading === 'call-next'}
                disabled={!queueStatus?.isOpen || queueStatus?.waitingCount === 0}
                icon={PlayCircle}
              >
                Call Next Customer
              </Button>
            )}

            {activeCounter?.status === 'calling' && (
              <>
                <Button
                  variant="success"
                  size="md"
                  onClick={handleStartServing}
                  loading={actionLoading === 'start-serving'}
                  icon={Play}
                >
                  Start Service
                </Button>
                <Button
                  variant="outline"
                  size="md"
                  onClick={handleSkip}
                  loading={actionLoading === 'skip'}
                  icon={SkipForward}
                >
                  Skip / No-Show
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={handleCallNext}
                  loading={actionLoading === 'call-next'}
                  icon={PlayCircle}
                >
                  Recall / Next
                </Button>
              </>
            )}

            {activeCounter?.status === 'serving' && (
              <>
                <Button
                  variant="success"
                  size="md"
                  onClick={handleComplete}
                  loading={actionLoading === 'complete'}
                  icon={CheckSquare}
                >
                  Complete Service ({formatTimer(elapsedServiceSeconds)})
                </Button>
                <Button
                  variant="outline"
                  size="md"
                  onClick={handleSkip}
                  loading={actionLoading === 'skip'}
                  icon={SkipForward}
                >
                  Cancel / Skip
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Live Metrics Grid ── */}
      {queueStatus && (
        <div className="stats-grid">
          <StatCard
            label="In Waiting Line"
            value={queueStatus.waitingCount}
            icon={Users}
            helper="Customers waiting ahead"
          />
          <StatCard
            label="Currently Serving"
            value={queueStatus.inServiceCount || queueStatus.servingCount}
            icon={Monitor}
            helper="Across all counters"
          />
          <StatCard
            label="Completed Today"
            value={queueStatus.servedCount}
            icon={CheckCircle2}
            helper="Successful consultations"
          />
          <StatCard
            label="Total Tokens"
            value={queueStatus.totalIssued}
            icon={Ticket}
            helper="Total tickets in session"
          />
        </div>
      )}

      {/* ── Services Workload Overview ── */}
      {queueStatus?.services && queueStatus.services.length > 0 && (
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
          {queueStatus.services.map((s) => (
            <div
              key={s.id}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '0.6rem 1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                fontSize: '0.85rem',
              }}
            >
              <Badge variant="neutral">{s.prefix}</Badge>
              <span style={{ fontWeight: 500 }}>{s.name}:</span>
              <strong style={{ color: s.waiting_count > 0 ? 'var(--primary)' : 'var(--text-muted)' }}>
                {s.waiting_count} waiting
              </strong>
            </div>
          ))}
        </div>
      )}

      {/* ── General Session Controls ── */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '2.5rem' }}>
        <Button
          variant={queueStatus?.isOpen ? 'warning' : 'primary'}
          size="md"
          onClick={handleToggle}
          loading={actionLoading === 'toggle'}
          icon={queueStatus?.isOpen ? PauseCircle : PlayCircle}
        >
          {queueStatus?.isOpen ? 'Suspend Queue Intake' : 'Open Queue Intake'}
        </Button>

        <Button
          variant="outline"
          size="md"
          onClick={() => setShowResetConfirm(true)}
          icon={RotateCcw}
        >
          Archive & Reset Session
        </Button>
      </div>

      {/* ── Reset Confirmation Modal (Non-Destructive) ── */}
      <Modal
        isOpen={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        title="Archive Current Queue Session?"
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowResetConfirm(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleReset} loading={actionLoading === 'reset'}>
              Yes, Archive & Start New Session
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
          <AlertTriangle size={24} color="var(--amber)" style={{ flexShrink: 0, marginTop: '0.15rem' }} />
          <div>
            <p className="modal-desc" style={{ marginBottom: '0.5rem' }}>
              This safely archives today's active session and opens a fresh queue session.
            </p>
            <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
              ✓ All historical service records, timestamps, and analytics are permanently preserved in PostgreSQL.
            </p>
          </div>
        </div>
      </Modal>

      {/* ── Token Management & Filter Roster ── */}
      <div className="token-list-section">
        <div className="token-list-header">
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Queue Token Roster</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Full lifecycle tracking: waiting → called → serving → completed
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Filter size={15} color="var(--text-muted)" />
              <select
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
                <option value="called">Called Only</option>
                <option value="serving">Serving Only</option>
                <option value="completed">Completed Only</option>
                <option value="cancelled">Cancelled Only</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <select
                value={serviceFilter}
                onChange={(e) => {
                  setServiceFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="form-select"
                style={{ width: 'auto', padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
              >
                <option value="">All Services</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.prefix})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {tokens.length === 0 ? (
          <EmptyState
            title="No tokens match current filters"
            description="New tickets will appear here automatically as customers check in."
          />
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              ← Previous
            </Button>
            <span className="page-info">
              Page {currentPage} of {pagination.pages} ({pagination.total} records)
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
