import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { registerUser } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import Alert from '../components/Alert';
import Button from '../components/common/Button';
import BrandLogo from '../components/common/BrandLogo';
import { UserPlus } from 'lucide-react';

export default function RegisterPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    role: 'user',
  });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setFieldErrors([]);
    setLoading(true);

    try {
      const res = await registerUser(form);
      const { user, token } = res.data.data;
      login(user, token);
      navigate(user.role === 'staff' ? '/staff' : '/take-token');
    } catch (err) {
      const data = err.response?.data;
      if (data?.errors) {
        setFieldErrors(data.errors);
      } else {
        setError(data?.message || 'Registration failed. Please verify your details.');
      }
    } finally {
      setLoading(false);
    }
  };

  const getFieldError = (field) =>
    fieldErrors.find((e) => e.field === field)?.message;

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-brand-badge">
            <BrandLogo size="lg" link={false} />
          </div>
          <h1 className="auth-title">Create your account</h1>
          <p className="auth-subtitle">Join Quebee to manage queues or take tokens</p>
        </div>

        <Alert type="error" message={error} onDismiss={() => setError('')} />

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              name="username"
              value={form.username}
              onChange={handleChange}
              placeholder="e.g. alexsmith"
              required
              className={`form-input ${getFieldError('username') ? 'input-error' : ''}`}
            />
            {getFieldError('username') && (
              <span className="field-error">{getFieldError('username')}</span>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="email">Email Address</label>
            <input
              id="email"
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              placeholder="alex@example.com"
              required
              className={`form-input ${getFieldError('email') ? 'input-error' : ''}`}
            />
            {getFieldError('email') && (
              <span className="field-error">{getFieldError('email')}</span>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              placeholder="At least 6 characters"
              required
              className={`form-input ${getFieldError('password') ? 'input-error' : ''}`}
            />
            {getFieldError('password') && (
              <span className="field-error">{getFieldError('password')}</span>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="role">Account Role</label>
            <select
              id="role"
              name="role"
              value={form.role}
              onChange={handleChange}
              className="form-select"
            >
              <option value="user">Customer / Patient / Visitor (Queue Client)</option>
              <option value="staff">Staff / Service Desk Operator</option>
            </select>
          </div>

          <div style={{ marginTop: '0.75rem' }}>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              loading={loading}
              icon={UserPlus}
            >
              Complete Registration
            </Button>
          </div>
        </form>

        <p className="auth-switch">
          Already registered on Quebee?{' '}
          <Link to="/login" style={{ fontWeight: 600 }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}
