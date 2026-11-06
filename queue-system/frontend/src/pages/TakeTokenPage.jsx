import React, { useState, useEffect, useCallback } from 'react';
import { generateToken, getMyToken, getQueueStatus } from '../api/queue';
import { useAuth } from '../context/AuthContext';
import Alert from '../components/Alert';
import Spinner from '../components/Spinner';
import TokenCard from '../components/TokenCard';
import Button from '../components/common/Button';
import Badge from '../components/common/Badge';
import { Ticket, Clock, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

export default function TakeTokenPage() {
  const { user } = useAuth();
  const [myToken, setMyToken] = useState(null);
  const [queueStatus, setQueueStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [statusRes] = await Promise.all([getQueueStatus()]);
      setQueueStatus(statusRes.data.data);

      try {
        const tokenRes = await getMyToken();
        setMyToken(tokenRes.data.data.token);
      } catch (err) {
        if (err.response?.status === 404) {
          setMyToken(null);
        }
      }
    } catch (err) {
      setError('Could not refresh queue status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      getQueueStatus()
        .then((res) => setQueueStatus(res.data.data))
        .catch(() => {});
    }, 4000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleGenerateToken = async () => {
    setError('');
    setSuccess('');
    setGenerating(true);
    try {
      const res = await generateToken();
      setMyToken(res.data.data.token);
      setSuccess(res.data.message || 'Token issued successfully');
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

  if (loading) {
    return (
      <div className="page-center">
        <Spinner size="lg" label="Loading your ticket..." />
      </div>
    );
  }

  // Outcome 2: Transparent Waiting-Time Estimation calculation
  const tokensAhead = myToken && queueStatus
    ? Math.max(0, myToken.token_number - (queueStatus.currentServing || 0))
    : 0;

  // Assuming baseline service time estimate of ~5 minutes per person ahead
  const estimatedMinutes = Math.max(2, tokensAhead * 5);

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
                ? `Counter Open · Now Serving #${queueStatus.currentServing || '—'} · ${queueStatus.waitingCount} in queue`
                : 'Counter is currently closed'}
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

          {/* Wait estimation block */}
          {myToken.status === 'waiting' && (
            <div className="wait-estimate">
              <Clock size={20} className="wait-estimate-icon" />
              <div>
                <div style={{ fontWeight: 600 }}>
                  {tokensAhead === 0
                    ? 'You are next in line! Please prepare to proceed.'
                    : `Estimated wait: ~${estimatedMinutes} mins (${tokensAhead} token${tokensAhead > 1 ? 's' : ''} ahead)`}
                </div>
                <div className="wait-disclaimer">
                  * Estimated waiting time is calculated from current queue workload and active counters. Actual time may vary.
                </div>
              </div>
            </div>
          )}

          {myToken.status === 'serving' && (
            <div className="your-turn-banner">
              <CheckCircle2 size={24} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '0.5rem' }} />
              It's your turn! Please proceed to Counter 01.
            </div>
          )}
        </div>
      ) : (
        <div className="no-token-section">
          <div className="no-token-icon-wrap">
            <Ticket size={32} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.35rem' }}>
              No Active Token
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: 360 }}>
              Generate your digital token to enter the queue and track your position in real-time.
            </p>
          </div>

          <Button
            variant="primary"
            size="lg"
            onClick={handleGenerateToken}
            loading={generating}
            disabled={generating || !queueStatus?.isOpen}
            icon={Ticket}
          >
            {generating ? 'Generating Token...' : 'Get Queue Token'}
          </Button>

          {!queueStatus?.isOpen && (
            <p style={{ fontSize: '0.825rem', color: 'var(--danger)', fontWeight: 500 }}>
              The counter is closed. Please wait for staff to open the session.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
