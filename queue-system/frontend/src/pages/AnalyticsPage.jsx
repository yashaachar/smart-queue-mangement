import React, { useState, useEffect, useCallback } from 'react';
import { getAnalytics, exportAnalyticsCsv, getAIOperationalDigest } from '../api/queue';
import Spinner from '../components/Spinner';
import Alert from '../components/Alert';
import StatCard from '../components/common/StatCard';
import Badge from '../components/common/Badge';
import Button from '../components/common/Button';
import {
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Download,
  Users,
  Monitor,
  Lightbulb,
  Sparkles,
  BarChart3,
  Calendar,
  Layers,
  FileSpreadsheet,
} from 'lucide-react';

export default function AnalyticsPage() {
  const [data, setData] = useState(null);
  const [aiDigest, setAiDigest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const [analyticsRes, digestRes] = await Promise.all([
        getAnalytics(),
        getAIOperationalDigest().catch(() => ({ data: { data: null } })),
      ]);
      setData(analyticsRes.data.data);
      setAiDigest(digestRes.data.data);
    } catch (err) {
      setError('Failed to load operational analytics data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const res = await exportAnalyticsCsv();
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `quebee_service_records_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      setError('Failed to download CSV dataset.');
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="page-center">
        <Spinner size="lg" label="Computing operational analytics & bottlenecks..." />
      </div>
    );
  }

  const { kpis, hourlyDistribution = [], counterUtilization = [], servicePerformance = [], recommendations = [] } =
    data || {};

  // Find max hourly volume for bar chart proportional scaling
  const maxHourlyVolume = Math.max(1, ...hourlyDistribution.map((h) => h.token_volume));

  return (
    <div className="analytics-page">
      {/* ── Page Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <h1 className="page-title">Analytics & Bottleneck Optimization</h1>
            <Badge variant="primary">PS-13 Outcomes 4 & 5</Badge>
          </div>
          <p className="page-subtitle" style={{ marginBottom: 0 }}>
            Real database metrics, peak surge identification, and empirical staffing recommendations
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            loading={exporting}
            icon={Download}
          >
            Export CSV Dataset
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={fetchAnalytics}
            icon={TrendingUp}
          >
            Refresh Metrics
          </Button>
        </div>
      </div>

      <Alert type="error" message={error} onDismiss={() => setError('')} />

      {/* ── High-Level KPIs ── */}
      {kpis && (
        <div className="stats-grid">
          <StatCard
            label="Total Customer Volume"
            value={kpis.totalTokens}
            icon={Users}
            helper={`${kpis.completionRate}% completed`}
          />
          <StatCard
            label="Avg. Waiting Time"
            value={`${kpis.avgWaitMinutes}m`}
            icon={Clock}
            helper="Issue to counter dispatch"
          />
          <StatCard
            label="Avg. Service Duration"
            value={`${kpis.avgServiceMinutes}m`}
            icon={CheckCircle2}
            helper="Active consultation handling"
          />
          <StatCard
            label="Service Completions"
            value={kpis.completedTokens}
            icon={CheckCircle2}
            helper={`${kpis.cancelledTokens} cancelled`}
          />
        </div>
      )}

      {/* ── AI Executive Summary Digest ── */}
      {aiDigest?.executiveSummary && (
        <div className="card" style={{ marginBottom: '2.5rem', background: 'var(--surface)', borderLeft: '4px solid #8b5cf6' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem' }}>
            <Sparkles size={20} color="#8b5cf6" />
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Intelligent Operational Summary</h3>
            <Badge variant="neutral">Automated Insights</Badge>
          </div>
          <ul style={{ paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--text)' }}>
            {aiDigest.executiveSummary.map((item, idx) => (
              <li key={idx} style={{ lineHeight: 1.5 }}>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Evidence-Based Operational Recommendations (Outcome 5) ── */}
      <div style={{ marginBottom: '2.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <Lightbulb size={20} color="var(--amber)" />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Service Analytics & Recommendations</h2>
        </div>

        {recommendations.length === 0 ? (
          <div className="card" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            No recommendations generated. Queue workload is currently within ideal performance thresholds.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
            {recommendations.map((rec) => (
              <div
                key={rec.id}
                className="card"
                style={{
                  padding: '1.5rem',
                  borderTop: `3px solid var(--${rec.priority === 'high' ? 'danger' : rec.priority === 'medium' ? 'warning' : 'success'})`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
                  <Badge variant={rec.priority === 'high' ? 'danger' : rec.priority === 'medium' ? 'warning' : 'success'}>
                    {rec.priority.toUpperCase()} PRIORITY
                  </Badge>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {rec.metric}
                  </span>
                </div>
                <h4 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '0.4rem' }}>{rec.title}</h4>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '1rem' }}>
                  {rec.message}
                </p>
                <div style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0.75rem', fontSize: '0.825rem', color: 'var(--text)' }}>
                  <strong>Recommended Action:</strong> {rec.action}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Peak-Hour Arrival & Workload Distribution (Outcome 4) ── */}
      <div className="card" style={{ marginBottom: '2.5rem', padding: '1.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Hourly Volume & Peak-Hour Breakdown</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Arrival volume and average waiting times distributed by hour of day
            </p>
          </div>
          <Badge variant="primary">Real Database Records</Badge>
        </div>

        {hourlyDistribution.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
            No tokens recorded today yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {hourlyDistribution.map((h) => {
              const widthPct = Math.max(8, Math.round((h.token_volume / maxHourlyVolume) * 100));
              const isPeak = h.token_volume === maxHourlyVolume && h.token_volume >= 2;
              const timeLabel = `${h.hour_of_day}:00–${h.hour_of_day + 1}:00`;

              return (
                <div key={h.hour_of_day} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ width: '90px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {timeLabel}
                  </div>
                  <div style={{ flex: 1, background: 'var(--surface-alt)', borderRadius: 'var(--radius-sm)', height: '28px', position: 'relative', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${widthPct}%`,
                        height: '100%',
                        background: isPeak ? 'var(--primary)' : 'var(--primary-border)',
                        borderRadius: 'var(--radius-sm)',
                        display: 'flex',
                        alignItems: 'center',
                        paddingLeft: '0.75rem',
                        transition: 'width 0.4s ease',
                      }}
                    >
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: isPeak ? '#fff' : 'var(--text)' }}>
                        {h.token_volume} {h.token_volume === 1 ? 'ticket' : 'tickets'}
                      </span>
                    </div>
                  </div>
                  <div style={{ width: '130px', fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                    Avg wait: <strong>{h.avg_wait_min || 0}m</strong>
                  </div>
                  {isPeak && (
                    <Badge variant="danger" dot>
                      Peak Surge
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Counter Utilization & Efficiency Comparison ── */}
      <div className="card" style={{ marginBottom: '2.5rem', padding: '1.75rem' }}>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.35rem' }}>
          Counter Workload & Utilization
        </h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
          Consultation throughput and active serving duration compared across service desks
        </p>

        <div className="logs-table-wrapper">
          <table className="logs-table">
            <thead>
              <tr>
                <th>Counter Station</th>
                <th>Tokens Served</th>
                <th>Total Active Time</th>
                <th>Avg. Duration</th>
                <th>Efficiency Status</th>
              </tr>
            </thead>
            <tbody>
              {counterUtilization.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                    No counter activity recorded.
                  </td>
                </tr>
              ) : (
                counterUtilization.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.counter_name}</td>
                    <td>
                      <strong style={{ color: 'var(--primary)' }}>{c.tokens_served}</strong> customers
                    </td>
                    <td>{c.total_serving_minutes || 0} mins</td>
                    <td>{c.avg_duration_min || 0} mins</td>
                    <td>
                      <Badge variant={c.tokens_served > 0 ? 'success' : 'neutral'} dot>
                        {c.tokens_served > 0 ? 'Active Throughput' : 'Standby / Idle'}
                      </Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Service Performance & Bottleneck Benchmarks ── */}
      <div className="card" style={{ padding: '1.75rem' }}>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.35rem' }}>
          Service Category Performance & Bottlenecks
        </h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
          Comparing actual service duration vs standard benchmarks to identify processing delays
        </p>

        <div className="logs-table-wrapper">
          <table className="logs-table">
            <thead>
              <tr>
                <th>Service Name</th>
                <th>Code</th>
                <th>Total Volume</th>
                <th>Target Handling</th>
                <th>Actual Avg Handling</th>
                <th>Avg. Wait Time</th>
                <th>Bottleneck Flag</th>
              </tr>
            </thead>
            <tbody>
              {servicePerformance.map((s) => {
                const isBottleneck =
                  s.actual_avg_duration && s.target_duration && parseFloat(s.actual_avg_duration) > parseFloat(s.target_duration) * 1.25;

                return (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 600 }}>{s.name}</td>
                    <td>
                      <code>{s.prefix}</code>
                    </td>
                    <td>{s.total_requests}</td>
                    <td>{s.target_duration} mins</td>
                    <td style={{ fontWeight: 600, color: isBottleneck ? 'var(--danger)' : 'var(--text)' }}>
                      {s.actual_avg_duration ? `${s.actual_avg_duration} mins` : '—'}
                    </td>
                    <td>{s.actual_avg_wait ? `${s.actual_avg_wait} mins` : '—'}</td>
                    <td>
                      {isBottleneck ? (
                        <Badge variant="danger" dot>
                          Bottleneck (&gt;25% delay)
                        </Badge>
                      ) : (
                        <Badge variant="success" dot>
                          Within Target
                        </Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

