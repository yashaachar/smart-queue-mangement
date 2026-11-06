import React, { useState, useEffect, useCallback } from 'react';
import { generateToken, getMyToken } from '../api/queue';
import { getQueueStatus } from '../api/queue';
import { useAuth } from '../context/AuthContext';
import Alert from '../components/Alert';
import Spinner from '../components/Spinner';
import TokenCard from '../components/TokenCard';

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

      // Try to get user's existing token — 404 is fine (no active token)
      try {
        const tokenRes = await getMyToken();
        setMyToken(tokenRes.data.data.token);
      } catch (err) {
        if (err.response?.status === 404) {
          setMyToken(null);
        }
      }
    } catch (err) {
      setError('Could not load queue information.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Poll queue status every 5 seconds to update wait info
    const interval = setInterval(() => {
      getQueueStatus()
        .then((res) => setQueueStatus(res.data.data))
        .catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleGenerateToken = async () => {
    setError('');
    setSuccess('');
    setGenerating(true);
    try {
      const res = await generateToken();
      setMyToken(res.data.data.token);
      setSuccess(res.data.message);
    } catch (err) {
      const msg = err.response?.data?.message;
      if (err.response?.status === 429) {
        setError(msg || 'Too many requests. Please wait a moment.');
      } else {
        setError(msg || 'Failed to generate token. Please try again.');
      }
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="page-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const estimatedWait = myToken && queueStatus
    ? Math.max(0, myToken.token_number - (queueStatus.currentServing || 0))
    : null;

  return (
    <div className="take-token-page">
      <h1 className="page-title">Take a Queue Token</h1>
      <p className="page-subtitle">Hello, <strong>{user?.username}</strong>!</p>

      <Alert type="success" message={success} onDismiss={() => setSuccess('')} />
      <Alert type="error" message={error} onDismiss={() => setError('')} />

      {queueStatus && (
        <div className={`queue-info-banner ${queueStatus.isOpen ? 'open' : 'closed'}`}>
          {queueStatus.isOpen
            ? `Counter is open · Now serving #${queueStatus.currentServing || '—'} · ${queueStatus.waitingCount} waiting`
            : 'Counter is currently closed'}
        </div>
      )}

      {myToken ? (
        <div className="my-token-section">
          <h2>Your Token</h2>
          <TokenCard token={myToken} />

          {myToken.status === 'waiting' && estimatedWait !== null && (
            <div className="wait-estimate">
              <span className="wait-icon">⏳</span>
              <span>
                {estimatedWait === 0
                  ? 'You are next!'
                  : `Approximately ${estimatedWait} token(s) ahead of you`}
              </span>
            </div>
          )}

          {myToken.status === 'serving' && (
            <div className="your-turn-banner">
              🎉 It's your turn! Please proceed to the counter.
            </div>
          )}
        </div>
      ) : (
        <div className="no-token-section">
          <div className="no-token-icon">🎫</div>
          <p>You don't have an active token yet.</p>
          <button
            className="btn btn-primary btn-lg"
            onClick={handleGenerateToken}
            disabled={generating || !queueStatus?.isOpen}
          >
            {generating ? <Spinner size="sm" /> : 'Generate My Token'}
          </button>
          {!queueStatus?.isOpen && (
            <p className="closed-note">The counter is closed. Please wait for it to open.</p>
          )}
        </div>
      )}
    </div>
  );
}
