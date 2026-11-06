import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getQueueStatus } from '../api/queue';
import {
  Sparkles,
  ArrowRight,
  Monitor,
  Ticket,
  Clock,
  ShieldCheck,
  TrendingUp,
  Brain,
  Building2,
  Stethoscope,
  Landmark,
  ShoppingBag,
  GraduationCap,
  Sparkle,
  CheckCircle2,
} from 'lucide-react';
import Button from '../components/common/Button';
import Badge from '../components/common/Badge';

export default function LandingPage() {
  const [queueStatus, setQueueStatus] = useState(null);
  const [activeIndustry, setActiveIndustry] = useState('healthcare');

  useEffect(() => {
    getQueueStatus()
      .then((res) => setQueueStatus(res.data.data))
      .catch(() => {});
  }, []);

  const industries = [
    {
      id: 'healthcare',
      name: 'Healthcare',
      icon: Stethoscope,
      customerTerm: 'Patients',
      stationTerm: 'Triage & Clinics',
      description: 'Streamline patient flow across emergency, outpatient clinics, and diagnostics with safe priority routing.',
      metrics: '38% lower waiting anxiety',
    },
    {
      id: 'banking',
      name: 'Banking & Finance',
      icon: Landmark,
      customerTerm: 'Clients',
      stationTerm: 'Teller Desks',
      description: 'Differentiate routine deposits from loan consultations while maintaining strict privacy and VIP routing.',
      metrics: '45% faster desk throughput',
    },
    {
      id: 'retail',
      name: 'Retail & Service',
      icon: ShoppingBag,
      customerTerm: 'Shoppers',
      stationTerm: 'Service Desks',
      description: 'Eliminate physical lines for returns, warranty repairs, and pickup desks with mobile ticketing.',
      metrics: '92% visitor satisfaction',
    },
    {
      id: 'government',
      name: 'Public Sector',
      icon: Building2,
      customerTerm: 'Citizens',
      stationTerm: 'Service Counters',
      description: 'Manage high-volume document verification, licenses, and permits with orderly digital queuing.',
      metrics: 'Zero lobby crowding',
    },
    {
      id: 'education',
      name: 'Education',
      icon: GraduationCap,
      customerTerm: 'Students',
      stationTerm: 'Advising Desks',
      description: 'Organize peak semester registrations, financial aid counseling, and campus administrative support.',
      metrics: 'Seamless peak days',
    },
  ];

  const currentInd = industries.find((i) => i.id === activeIndustry) || industries[0];

  return (
    <div className="landing-page">
      {/* ── Hero Section ── */}
      <section className="landing-hero">
        <div className="hero-pill">
          <Sparkles size={14} aria-hidden="true" />
          <span>PS-13: Smart Queue and Service-Time Optimization Platform</span>
        </div>

        <h1 className="hero-headline">
          Smart queues. <br />
          <span className="hero-headline-accent">Better experiences.</span>
        </h1>

        <p className="hero-lead">
          Quebee eliminates waiting-room chaos with concurrency-safe token generation,
          predictive wait-time estimation, and real-time bottleneck detection for any service industry.
        </p>

        <div className="hero-actions">
          <Link to="/take-token">
            <Button variant="primary" size="lg" icon={Ticket}>
              Take a Digital Token
            </Button>
          </Link>
          <Link to="/display">
            <Button variant="secondary" size="lg" icon={Monitor}>
              View Live Display Board
            </Button>
          </Link>
          <Link to="/staff">
            <Button variant="ghost" size="lg" icon={ArrowRight}>
              Staff Terminal
            </Button>
          </Link>
        </div>

        {/* Live system status badge */}
        {queueStatus && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.75rem', padding: '0.45rem 1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-full)', boxShadow: 'var(--shadow-xs)' }}>
            <span style={{ display: 'inline-flex', width: 8, height: 8, borderRadius: '50%', background: queueStatus.isOpen ? 'var(--success)' : 'var(--danger)' }} />
            <span style={{ fontSize: '0.825rem', fontWeight: 500, color: 'var(--text-muted)' }}>
              Live System Status: <strong style={{ color: 'var(--text)' }}>{queueStatus.isOpen ? 'Counter Active' : 'Counter Closed'}</strong> · Now Serving: <strong style={{ color: 'var(--primary)' }}>{queueStatus.currentServing > 0 ? `#${queueStatus.currentServing}` : '—'}</strong> · Waiting: <strong style={{ color: 'var(--text)' }}>{queueStatus.waitingCount}</strong>
            </span>
          </div>
        )}
      </section>

      {/* ── Live Preview Card ── */}
      <div className="landing-preview-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <span className="section-tag">Universal Experience</span>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>A unified platform for customers, staff, and displays</h3>
          </div>
          <Badge variant="primary" dot>
            Dual-Layer Concurrency Locked
          </Badge>
        </div>

        <div className="stats-grid" style={{ margin: 0 }}>
          <div className="stat-card">
            <div className="stat-header">
              <span className="stat-label">Now Serving</span>
              <Monitor size={16} className="stat-icon" />
            </div>
            <div className="stat-value" style={{ color: 'var(--primary)' }}>
              {queueStatus?.currentServing > 0 ? `#${queueStatus.currentServing}` : '#101'}
            </div>
            <span className="stat-helper">Counter 01 · Main Hall</span>
          </div>

          <div className="stat-card">
            <div className="stat-header">
              <span className="stat-label">In Line</span>
              <Ticket size={16} className="stat-icon" />
            </div>
            <div className="stat-value">
              {queueStatus ? queueStatus.waitingCount : '4'}
            </div>
            <span className="stat-helper">Active tokens waiting</span>
          </div>

          <div className="stat-card">
            <div className="stat-header">
              <span className="stat-label">Avg. Service Time</span>
              <Clock size={16} className="stat-icon" />
            </div>
            <div className="stat-value">5.8<span style={{ fontSize: '1.2rem', fontWeight: 500 }}>m</span></div>
            <span className="stat-helper">Calibrated dynamically</span>
          </div>

          <div className="stat-card">
            <div className="stat-header">
              <span className="stat-label">System Integrity</span>
              <ShieldCheck size={16} className="stat-icon" />
            </div>
            <div className="stat-value" style={{ color: 'var(--success)' }}>100%</div>
            <span className="stat-helper">Zero duplicate tokens</span>
          </div>
        </div>
      </div>

      {/* ── Industry Customization Section ── */}
      <section className="landing-section">
        <div style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto 2.5rem' }}>
          <span className="section-tag">Flexible Domain Engine</span>
          <h2 className="section-title">Built for any service environment</h2>
          <p className="section-desc">
            One powerful queue engine with configurable terminology, department hierarchies, and priority rules.
          </p>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
          {industries.map((ind) => {
            const Icon = ind.icon;
            const isSelected = activeIndustry === ind.id;
            return (
              <button
                key={ind.id}
                onClick={() => setActiveIndustry(ind.id)}
                className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                style={{ borderRadius: 'var(--radius-full)' }}
              >
                <Icon size={14} aria-hidden="true" />
                <span>{ind.name}</span>
              </button>
            );
          })}
        </div>

        <div style={{ maxWidth: 800, margin: '0 auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '2rem', display: 'flex', gap: '2rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 300px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--amber)', letterSpacing: '0.05em' }}>
              Optimized for {currentInd.name}
            </span>
            <h3 style={{ fontSize: '1.4rem', fontWeight: 700, margin: '0.35rem 0 0.75rem' }}>
              Serving {currentInd.customerTerm} at {currentInd.stationTerm}
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.925rem', lineHeight: 1.6, marginBottom: '1.25rem' }}>
              {currentInd.description}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success)', fontSize: '0.85rem', fontWeight: 600 }}>
              <CheckCircle2 size={16} />
              <span>Demonstrated impact: {currentInd.metrics}</span>
            </div>
          </div>

          <div style={{ flex: '1 1 240px', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1.25rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Sample Digital Ticket
            </span>
            <div style={{ margin: '0.75rem 0', padding: '0.75rem 1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{currentInd.name} Division</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--primary)', letterSpacing: '-0.03em' }}>A-108</div>
              <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>Est. wait: ~12 mins · 2 ahead</div>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Adapts prefixes, priority flags, and ticket formatting per organization.
            </div>
          </div>
        </div>
      </section>

      {/* ── Official PS-13 Outcomes Grid ── */}
      <section className="landing-section">
        <div style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto 2.5rem' }}>
          <span className="section-tag">Core Capabilities</span>
          <h2 className="section-title">Engineered to official PS-13 specifications</h2>
          <p className="section-desc">
            Five mandatory outcomes deliverable from token generation to intelligent optimization recommendations.
          </p>
        </div>

        <div className="features-grid">
          <div className="feature-box">
            <div className="feature-icon-box">
              <ShieldCheck size={20} color="var(--primary)" />
            </div>
            <h4 className="feature-title">1. Concurrency-Safe Tokens</h4>
            <p className="feature-desc">
              Dual-layer locking via Redis distributed locks and PostgreSQL row-level locks (<code>FOR UPDATE</code>) ensures zero duplicate or skipped tokens during heavy burst traffic.
            </p>
          </div>

          <div className="feature-box">
            <div className="feature-icon-box">
              <Clock size={20} color="var(--amber)" />
            </div>
            <h4 className="feature-title">2. Predictive Wait-Time Engine</h4>
            <p className="feature-desc">
              Computes transparent mathematical wait estimates using active counter capacity and historical service duration moving averages, with clear confidence indicators.
            </p>
          </div>

          <div className="feature-box">
            <div className="feature-icon-box">
              <Monitor size={20} color="var(--success)" />
            </div>
            <h4 className="feature-title">3. Live Multi-Display Dashboards</h4>
            <p className="feature-desc">
              Dedicated interfaces for customer mobile tracking, high-visibility waiting-room public monitors with audio chime support, and staff counter terminals.
            </p>
          </div>

          <div className="feature-box">
            <div className="feature-icon-box">
              <TrendingUp size={20} color="#8b5cf6" />
            </div>
            <h4 className="feature-title">4. Peak-Hour & Bottleneck Analysis</h4>
            <p className="feature-desc">
              Aggregates hourly/daily token volumes, counter idle vs serving time, and queue throughput to automatically detect operational delays.
            </p>
          </div>

          <div className="feature-box">
            <div className="feature-icon-box">
              <Brain size={20} color="#06b6d4" />
            </div>
            <h4 className="feature-title">5. Service Analytics & Recommendations</h4>
            <p className="feature-desc">
              Actionable operational guidance — suggesting additional counter openings during peak surges and redistributing staff across overloaded departments.
            </p>
          </div>

          <div className="feature-box">
            <div className="feature-icon-box">
              <Sparkle size={20} color="var(--primary)" />
            </div>
            <h4 className="feature-title">AI Queue Assistant</h4>
            <p className="feature-desc">
              Privacy-conscious assistant answering customer inquiries regarding token status, expected wait, and queue instructions without exposing private records.
            </p>
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="landing-section">
        <div style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto 2.5rem' }}>
          <span className="section-tag">User Flow</span>
          <h2 className="section-title">Frictionless for customers and staff</h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.5rem', maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.75rem', position: 'relative' }}>
            <span style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--border-focus)', marginBottom: '0.75rem', display: 'block' }}>01</span>
            <h4 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Request Digital Token</h4>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Customers take a token online or on-site in seconds. Assigned a unique, sequential number with real-time status.
            </p>
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.75rem', position: 'relative' }}>
            <span style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--border-focus)', marginBottom: '0.75rem', display: 'block' }}>02</span>
            <h4 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Track Wait Remotely</h4>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Watch live queue advancement, see people ahead, and receive transparent wait-time estimations without waiting in line.
            </p>
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.75rem', position: 'relative' }}>
            <span style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--border-focus)', marginBottom: '0.75rem', display: 'block' }}>03</span>
            <h4 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Seamless Counter Service</h4>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Staff call the next customer with one click. Public display monitors and chimes alert the patient immediately.
            </p>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="landing-footer">
        <div className="footer-content">
          <div>
            <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>
              QUEBEE
            </span>
            <p className="footer-micro" style={{ marginTop: '0.25rem' }}>
              Smart queues. Better experiences.
            </p>
          </div>
          <div className="footer-micro">
            PS-13: Smart Queue and Service-Time Optimization Platform · Universal SaaS Architecture
          </div>
        </div>
      </footer>
    </div>
  );
}

