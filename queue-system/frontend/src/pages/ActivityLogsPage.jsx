import React, { useState, useEffect, useCallback } from 'react';
import { getActivityLogs } from '../api/queue';
import Spinner from '../components/Spinner';
import Alert from '../components/Alert';

const ACTION_COLORS = {
  TOKEN_ISSUED: '#3b82f6',
  TOKEN_SERVED: '#10b981',
  TOKEN_SKIPPED: '#f59e0b',
  QUEUE_ADVANCED: '#8b5cf6',
  QUEUE_RESET: '#ef4444',
  USER_REGISTERED: '#06b6d4',
  USER_LOGIN: '#6b7280',
  USER_LOGIN_FAILED: '#dc2626',
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
      setError('Failed to load activity logs.');
    } finally {
      setLoading(false);
    }
  }, [currentPage]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return (
    <div className="logs-page">
      <h1 className="page-title">Activity Logs</h1>
      <p className="page-subtitle">Recent system activity from MongoDB</p>

      <Alert type="error" message={error} onDismiss={() => setError('')} />

      {loading ? (
        <div className="page-center">
          <Spinner size="lg" />
        </div>
      ) : (
        <>
          <div className="logs-table-wrapper">
            <table className="logs-table" aria-label="Activity logs">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Action</th>
                  <th>Performed By</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="empty-cell">No logs found.</td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log._id}>
                      <td className="log-time">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td>
                        <span
                          className="action-badge"
                          style={{ backgroundColor: ACTION_COLORS[log.action] || '#6b7280' }}
                        >
                          {log.action.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="log-user">
                        {log.performedBy?.username || 'anonymous'}
                        {log.performedBy?.role && (
                          <span className={`role-badge role-${log.performedBy.role}`}>
                            {log.performedBy.role}
                          </span>
                        )}
                      </td>
                      <td className="log-details">
                        {Object.keys(log.details || {}).length > 0
                          ? JSON.stringify(log.details)
                          : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

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
                Page {currentPage} of {pagination.pages} ({pagination.total} total)
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
        </>
      )}
    </div>
  );
}
