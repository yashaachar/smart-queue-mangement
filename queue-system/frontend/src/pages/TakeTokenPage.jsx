import React, { useState, useEffect, useCallback } from 'react';
import { generateToken, getMyToken, getQueueStatus, getServices, cancelToken, subscribeQueueStream } from '../api/queue';
import { useAuth } from '../context/AuthContext';
import Alert from '../components/Alert';
import Spinner from '../components/Spinner';
import TokenCard from '../components/TokenCard';
import Button from '../components/common/Button';
import Badge from '../components/common/Badge';
import Modal from '../components/common/Modal';
import {
  Ticket,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  XCircle,
  Sparkles,
  ArrowRight,
  MapPin,
} from 'lucide-react';

export default function TakeTokenPage() {
  const { user } = useAuth();
  const [myToken, setMyToken] = useState(null);
  const [queueStatus, setQueueStatus] = useState(null);
  const [services, setServices] = useState([]);
  const [selectedServiceId, setSelectedServiceId] = useState(null);
  const [priorityTier, setPriorityTier] = useState(0);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [statusRes, servicesRes] = await Promise.all([
        getQueueStatus(),
        getServices(),
      ]);
      setQueueStatus(statusRes.data.data);
      const activeServices = servicesRes.data.data.services;
      setServices(activeServices);
      if (activeServices.length > 0 && !selectedServiceId) {
        setSelectedServiceId(activeServices[0].id);
      }

      try {
        const tokenRes = await getMyToken();
        setMyToken(tokenRes.data.data.token);
      } catch (err) {
        if (err.response?.status === 404) {
          setMyToken(null);
        }
      }
    } catch (err) {
      setError('Could not refresh live queue data.');
    } finally {
      setLoading(false);
    }
  }, [selectedServiceId]);

  useEffect(() => {
    fetchData();

    // Setup Real-time SSE stream for instant ticket advancement
    const unsubscribeSSE = subscribeQueueStream((data) => {
      setQueueStatus(data);
      // Refresh my token position when queue updates
      getMyToken()
        .then((res) => setMyToken(res.data.data.token))
        .catch((err) => {
          if (err.response?.status === 404) setMyToken(null);
        });
    });

    const interval = setInterval(() => {
      getQueueStatus()
        .then((res) => setQueueStatus(res.data.data))
        .catch(() => {});
      getMyToken()
        .then((res) => setMyToken(res.data.data.token))
        .catch((err) => {
          if (err.response?.status === 404) setMyToken(null);
        });
    }, 6000);

    return () => {
      unsubscribeSSE();
      clearInterval(interval);
    };
  }, [fetchData]);

  const handleGenerateToken = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setGenerating(true);

    try {
      const payload = {
        service_id: selectedServiceId,
        priority: priorityTier,
        notes: notes.trim() || undefined,
        customer_name: user?.username || 'Guest',
      };

      const res = await generateToken(payload);
      setMyToken(res.data.data.token);
      setSuccess(res.data.message || 'Queue token issued successfully');
    } catch (err) {
      const msg = err.response?.data?.message;
      if (err.response?.status === 429) {
        setError(msg || 'System is processing another request. Please retry in a moment.');
      } else {
        setError(msg || 'Failed to issue token. Please try again.');
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleCancelToken = async () => {
    if (!myToken) return;
    setCancelling(true);
    setError('');
    try {
      const res = await cancelToken(myToken.id);
      setSuccess(res.data.message || 'Ticket cancelled successfully');
      setMyToken(null);
      setShowCancelModal(false);
      await fetchData();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to cancel ticket.');
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="page-center">
        <Spinner size="lg" label="Loading your ticket..." />
      </div>
    );
  }

  const selectedService = services.find((s) => s.id === selectedServiceId);

  return (
    <div className="take-token-page">
      <div style={{ marginBottom: '1.75rem' }}>
        <h1 className="page-title">Digital Queue Ticket</h1>
        <p className="page-subtitle">
          Signed in as <strong style={{ color: 'var(--text)' }}>{user?.username}</strong> ({user?.email})
        </p>
      </div>

      <Alert type="success" message={success} onDismiss={() => setSuccess('')} />
      <Alert type="error" message={error} onDismiss={() => setError('')} />

      {queueStatus && (
        <div className={`queue-info-banner ${queueStatus.isOpen ? 'open' : 'closed'}`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: queueStatus.isOpen ? 'var(--success)' : 'var(--danger)' }} />
            <span>
              {queueStatus.isOpen
                ? `Quebee Session Active · Now Serving ${queueStatus.currentServingCode || (queueStatus.currentServing > 0 ? '#' + queueStatus.currentServing : '—')} · ${queueStatus.waitingCount} in line`
                : 'Session is currently paused or closed'}
            </span>
          </div>
        </div>
      )}

      {myToken ? (
        <div className="my-token-section">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 600 }}>Your Active Ticket</h2>
            <button
              onClick={fetchData}
              className="btn btn-ghost btn-sm"
              title="Refresh ticket status"
            >
              <RefreshCw size={14} />
              <span>Refresh</span>
            </button>
          </div>

          <TokenCard token={myToken} />

          {/* Turn alert banner when called */}
          {myToken.status === 'called' && (
            <div className="your-turn-banner" style={{ background: 'var(--primary-soft)', border: '1px solid var(--primary-border)', color: 'var(--primary)' }}>
              <MapPin size={24} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '0.5rem' }} />
              <strong>You are being called!</strong>
              <div style={{ fontSize: '0.95rem', fontWeight: 500, marginTop: '0.25rem' }}>
                Please proceed immediately to {myToken.counter_name || 'Counter 01'}.
              </div>
            </div>
          )}

          {myToken.status === 'serving' && (
            <div className="your-turn-banner">
              <CheckCircle2 size={24} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '0.5rem' }} />
              Service in progress at {myToken.counter_name || 'Counter 01'}.
            </div>
          )}

          {/* Wait estimation block for waiting state */}
          {myToken.status === 'waiting' && (
            <div className="wait-estimate">
              <Clock size={20} className="wait-estimate-icon" />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <div style={{ fontWeight: 600 }}>
                    {myToken.position_ahead === 0
                      ? 'You are next in line! Please stay in the reception area.'
                      : `Estimated wait: ~${myToken.formatted_range || `${myToken.estimated_wait_min} mins`} (${myToken.position_ahead} customer${myToken.position_ahead > 1 ? 's' : ''} ahead)`}
                  </div>
                  {myToken.confidence && (
                    <Badge variant={myToken.confidence === 'high' ? 'success' : myToken.confidence === 'medium' ? 'primary' : 'neutral'}>
                      {myToken.confidence.toUpperCase()} CONFIDENCE
                    </Badge>
                  )}
                </div>
                <div className="wait-disclaimer">
                  {myToken.disclaimer || '* Estimated waiting time is calculated from current service capacity and workload ahead. Actual duration may vary.'}
                </div>
              </div>
            </div>
          )}

          {/* Cancel ticket action */}
          {['waiting', 'called'].includes(myToken.status) && (
            <div style={{ marginTop: '1.25rem', textAlign: 'right' }}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCancelModal(true)}
                icon={XCircle}
              >
                Cancel Ticket
              </Button>
            </div>
          )}

          {/* Cancel Confirmation Modal */}
          <Modal
            isOpen={showCancelModal}
            onClose={() => setShowCancelModal(false)}
            title="Cancel Your Queue Ticket?"
            actions={
              <>
                <Button variant="secondary" onClick={() => setShowCancelModal(false)}>
                  Keep Ticket
                </Button>
                <Button variant="danger" onClick={handleCancelToken} loading={cancelling}>
                  Yes, Cancel Ticket
                </Button>
              </>
            }
          >
            <p className="modal-desc">
              Are you sure you want to surrender your spot in the queue for{' '}
              <strong>{myToken.token_code || '#' + myToken.token_number}</strong>? This cannot be undone.
            </p>
          </Modal>
        </div>
      ) : (
        <form onSubmit={handleGenerateToken} className="card" style={{ padding: '2rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
            <div className="no-token-icon-wrap" style={{ margin: '0 auto 1rem' }}>
              <Ticket size={28} />
            </div>
            <h3 style={{ fontSize: '1.3rem', fontWeight: 700 }}>Choose Your Service</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Select a service category to join the digital queue
            </p>
          </div>

          {/* Service Picker */}
          <div className="form-group">
            <label className="form-label">Available Services</label>
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              {services.map((s) => {
                const isSelected = selectedServiceId === s.id;
                return (
                  <div
                    key={s.id}
                    onClick={() => setSelectedServiceId(s.id)}
                    style={{
                      border: `1.5px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                      background: isSelected ? 'var(--primary-soft)' : 'var(--surface)',
                      borderRadius: 'var(--radius)',
                      padding: '0.85rem 1rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'var(--transition)',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.95rem', color: isSelected ? 'var(--primary)' : 'var(--text)' }}>
                        {s.name}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                        Token Prefix: <code>{s.prefix}</code> · Avg. Duration: ~{s.estimated_duration_min} mins
                      </div>
                    </div>
                    {isSelected && <Badge variant="primary">Selected</Badge>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Priority Tier Selection */}
          <div className="form-group" style={{ marginTop: '1rem' }}>
            <label className="form-label" htmlFor="priority-select">Priority Tier</label>
            <select
              id="priority-select"
              value={priorityTier}
              onChange={(e) => setPriorityTier(parseInt(e.target.value))}
              className="form-select"
            >
              <option value="0">Standard Service (Regular Queue)</option>
              <option value="1">Priority Access (Elderly / Assisted / Special Needs)</option>
              <option value="2">Urgent / Express Expedited</option>
            </select>
          </div>

          {/* Optional notes */}
          <div className="form-group">
            <label className="form-label" htmlFor="notes-input">Notes or Special Requirements (Optional)</label>
            <input
              id="notes-input"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. wheelchair access, quick inquiry"
              className="form-input"
            />
          </div>

          <div style={{ marginTop: '1.5rem' }}>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              loading={generating}
              disabled={generating || !queueStatus?.isOpen}
              icon={Ticket}
            >
              {generating ? 'Issuing Ticket...' : `Take Ticket for ${selectedService?.name || 'Queue'}`}
            </Button>
          </div>

          {!queueStatus?.isOpen && (
            <p style={{ fontSize: '0.825rem', color: 'var(--danger)', fontWeight: 500, textAlign: 'center', marginTop: '0.75rem' }}>
              The counter is currently closed. Token requests are temporarily paused.
            </p>
          )}
        </form>
      )}
    </div>
  );
}
