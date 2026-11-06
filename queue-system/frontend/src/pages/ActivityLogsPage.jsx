import React, { useState, useEffect, useCallback } from 'react';
import { getActivityLogs } from '../api/queue';
import Spinner from '../components/Spinner';
import Alert from '../components/Alert';
import Badge from '../components/common/Badge';
import Button from '../components/common/Button';
import EmptyState from '../components/common/EmptyState';
import { History, Shield, Calendar, User, Info } from 'lucide-react';

const ACTION_CONFIG = {
  TOKEN_ISSUED: { variant: 'primary', label: 'Token Issued' },
  TOKEN_SERVED: { variant: 'success', label: 'Token Served' },
  TOKEN_SKIPPED: { variant: 'warning', label: 'Token Skipped' },
  QUEUE_ADVANCED: { variant: 'primary', label: 'Queue Advanced' },
  QUEUE_RESET: { variant: 'danger', label: 'Queue Reset' },
  USER_REGISTERED: { variant: 'neutral', label: 'User Registered' },
  USER_LOGIN: { variant: 'neutral', label: 'User Login' },
  USER_LOGIN_FAILED: { variant: 'danger', label: 'Login Failed' },
};

export default function ActivityLogsPage() {
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getActivityLogs(currentPage);
      setLogs(res.data.data.logs);
      setPagination(res.data.data.pagination);
    } catch (err) {
      setError('Failed to load activity logs from MongoDB.');
    } finally {
      setLoading(false);
    }
  }, [currentPage]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return (
    <div className="logs-page">
      <div style={{ marginBottom: '1.75rem' }}>
        <h1 className="page-title">System Audit Logs</h1>
        <p className="page-subtitle">
          Immutable event stream recorded in MongoDB
        </p>
      </div>

      <Alert type="error" message={error} onDismiss={() => setError('')} />

      {loading ? (
        <div className="page-center">
          <Spinner size="lg" label="Querying MongoDB log records..." />
        </div>
      ) : (
        <>
          <div className="logs-table-wrapper">
            <table className="logs-table" aria-label="System activity audit trail">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Action Event</th>
                  <th>Actor</th>
                  <th>Details Payload</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      <EmptyState
                        icon={History}
                        title="No audit logs recorded"
                        description="Activity events will populate here as users and staff interact with Quebee."
                      />
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => {
                    const actionInfo = ACTION_CONFIG[log.action] || {
                      variant: 'neutral',
                      label: log.action.replace(/_/g, ' '),
                    };
                    return (
                      <tr key={log._id}>
                        <td className="log-time">
                          {new Date(log.createdAt).toLocaleString([], {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </td>
                        <td>
                          <Badge variant={actionInfo.variant} dot>
                            {actionInfo.label}
                          </Badge>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <span style={{ fontWeight: 500 }}>
                              {log.performedBy?.username || 'System'}
                            </span>
                            {log.performedBy?.role && (
                              <span className={`role-badge role-${log.performedBy.role}`}>
                                {log.performedBy.role}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="log-details">
                          {Object.keys(log.details || {}).length > 0 ? (
                            <code>{JSON.stringify(log.details)}</code>
                          ) : (
                            <span style={{ color: 'var(--text-subtle)' }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

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
                Page {currentPage} of {pagination.pages} ({pagination.total} events)
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
        </>
      )}
    </div>
  );
}
