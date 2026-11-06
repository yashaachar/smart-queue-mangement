import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getQueueStatus, subscribeQueueStream } from '../api/queue';
import Spinner from '../components/Spinner';
import Alert from '../components/Alert';
import Badge from '../components/common/Badge';
import StatCard from '../components/common/StatCard';
import {
  Monitor,
  Users,
  CheckCircle2,
  Ticket,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
  Radio,
  Clock,
  Sparkles,
} from 'lucide-react';

const FALLBACK_POLL_INTERVAL_MS = 6000;

export default function DisplayBoard() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [isSSEActive, setIsSSEActive] = useState(false);
  const prevServingRef = useRef(null);

  // Play audio chime when token advances
  const triggerAudioChime = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    } catch (_) {}
  }, []);

  const handleIncomingState = useCallback(
    (nextData) => {
      if (soundEnabled && prevServingRef.current !== null) {
        const prevCode = prevServingRef.current;
        const nextCode = nextData.currentServingCode || nextData.currentServing;
        if (nextCode && nextCode !== prevCode) {
          triggerAudioChime();
        }
      }
      prevServingRef.current = nextData.currentServingCode || nextData.currentServing;
      setStatus(nextData);
      setLastUpdated(new Date());
      setError('');
      setLoading(false);
    },
    [soundEnabled, triggerAudioChime]
  );

  const fetchStatus = useCallback(async () => {
    try {
      const res = await getQueueStatus();
      handleIncomingState(res.data.data);
    } catch (err) {
      setError('Reconnecting to Quebee live server...');
    } finally {
      setLoading(false);
    }
  }, [handleIncomingState]);

  // Subscribe to Real-Time SSE with Polling Fallback
  useEffect(() => {
    fetchStatus();

    // Setup SSE real-time push stream
    const unsubscribeSSE = subscribeQueueStream(
      (data) => {
        setIsSSEActive(true);
        handleIncomingState(data);
      },
      () => {
        // SSE disconnected: switch to polling fallback
        setIsSSEActive(false);
      }
    );

    // Fallback polling interval
    const interval = setInterval(() => {
      if (!isSSEActive) {
        fetchStatus();
      }
    }, FALLBACK_POLL_INTERVAL_MS);

    return () => {
      unsubscribeSSE();
      clearInterval(interval);
    };
  }, [fetchStatus, handleIncomingState, isSSEActive]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  if (loading) {
    return (
      <div className="page-center">
        <Spinner size="lg" label="Connecting to Quebee live board..." />
      </div>
    );
  }

  return (
    <div className={`display-board ${isFullscreen ? 'board-fullscreen' : ''}`}>
      <div className="board-card">
        {/* Header */}
        <div className="board-header">
          <div className="board-title-group">
            <h1 className="board-title">
              <Monitor size={24} color="var(--primary)" aria-hidden="true" />
              <span>Live Queue Display Board</span>
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.2rem' }}>
              <Badge variant={isSSEActive ? 'success' : 'neutral'} dot>
                {isSSEActive ? 'Live Real-Time Stream (SSE)' : 'Synchronized Polling'}
              </Badge>
              {lastUpdated && (
                <span className="stat-helper">
                  Updated {lastUpdated.toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`btn btn-sm ${soundEnabled ? 'btn-primary' : 'btn-outline'}`}
              title={soundEnabled ? 'Audio announcement chime active' : 'Turn on audio chime'}
              aria-label="Toggle sound chime"
            >
              {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
              <span>{soundEnabled ? 'Chime Active' : 'Chime Off'}</span>
            </button>

            <button
              onClick={toggleFullscreen}
              className="btn btn-secondary btn-sm"
              title="Fullscreen waiting room monitor mode"
              aria-label="Fullscreen mode"
            >
              {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              <span>{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
            </button>
          </div>
        </div>

        <Alert type="error" message={error} onDismiss={() => setError('')} />

        {status && (
          <>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem', gap: '0.75rem', flexWrap: 'wrap' }}>
              <Badge variant={status.isOpen ? 'success' : 'danger'} dot>
                {status.isOpen ? 'Counter Active & Calling' : 'Counter Suspended'}
              </Badge>

              {status.waitEstimate && (
                <Badge variant="primary">
                  <Clock size={12} style={{ marginRight: '0.25rem' }} />
                  Est. Wait Range: ~{status.waitEstimate.formattedRange}
                </Badge>
              )}
            </div>

            {/* Now Serving Big Callout */}
            <div className="now-serving-section">
              <p className="now-serving-label">Now Calling / Serving</p>
              <div className="now-serving-number">
                {status.currentServingCode ? (
                  <span className="token-big">{status.currentServingCode}</span>
                ) : status.currentServing > 0 ? (
                  <span className="token-big">#{status.currentServing}</span>
                ) : (
                  <span className="token-big token-empty">—</span>
                )}
              </div>
              <p style={{ fontSize: '0.95rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                {status.currentServingCode || status.currentServing > 0
                  ? 'Please proceed to your assigned service desk'
                  : 'Standing by for next waiting customer'}
              </p>
            </div>

            {/* Multi-Counter Status Grid */}
            {status.counters && status.counters.length > 0 && (
              <div style={{ marginBottom: '2.5rem' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '0.85rem', textAlign: 'left' }}>
                  Live Service Counters
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
                  {status.counters.map((c) => {
                    const isBusy = c.token_code || (c.token_number && c.token_status !== 'idle');
                    return (
                      <div
                        key={c.id}
                        style={{
                          background: isBusy ? 'var(--surface)' : 'var(--surface-alt)',
                          border: `1.5px solid ${isBusy ? 'var(--primary-border)' : 'var(--border)'}`,
                          borderRadius: 'var(--radius)',
                          padding: '1.25rem',
                          textAlign: 'left',
                          boxShadow: isBusy ? 'var(--shadow-sm)' : 'none',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                          <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{c.name}</span>
                          <Badge variant={isBusy ? 'primary' : 'neutral'} dot>
                            {c.status.toUpperCase()}
                          </Badge>
                        </div>
                        <div style={{ fontSize: '2rem', fontWeight: 800, color: isBusy ? 'var(--primary)' : 'var(--text-subtle)', letterSpacing: '-0.02em' }}>
                          {c.token_code || (c.token_number ? `#${c.token_number}` : 'Standby')}
                        </div>
                        {c.service_name && (
                          <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                            {c.service_name}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Live Metrics Grid */}
            <div className="stats-grid">
              <StatCard
                label="Waiting in Queue"
                value={status.waitingCount}
                icon={Users}
                helper="Customers in line"
              />
              <StatCard
                label="Served Today"
                value={status.servedCount}
                icon={CheckCircle2}
                helper="Completed consultations"
              />
              <StatCard
                label="Total Tokens Issued"
                value={status.totalIssued}
                icon={Ticket}
                helper="Session total"
              />
            </div>

            {status.waitingCount === 0 && status.currentServing === 0 && (
              <p style={{ color: 'var(--text-muted)', marginTop: '1.5rem', fontSize: '0.9rem' }}>
                All queues are clear. Have a great day!
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
