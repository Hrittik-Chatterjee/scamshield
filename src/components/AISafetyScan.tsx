// src/components/AISafetyScan.tsx
import { useState, useEffect } from 'react';

interface Props {
  query: string;
  mode: 'buyer' | 'seller';
}

interface ScanData {
  whoisAgeDays?: number;
  safeBrowsingOk: boolean;
  urlscanVerdict: string;
  webSearchSummary?: string;
  flags: string[];
  riskVerdict: 'safe' | 'caution' | 'high' | 'confirmed';
  explanation: string;
  analyzedAt: string;
}

const FLAG_DETAILS: Record<string, { icon: string; label: string; desc: string }> = {
  young_website: {
    icon: '⏳',
    label: 'Disposable Domain',
    desc: 'Associated website registered under 90 days ago — fraudulent storefronts are routinely discarded and replaced.',
  },
  malicious_url: {
    icon: '🚫',
    label: 'Flagged Malicious',
    desc: 'The domain/URL is actively flagged in Google Safe Browsing or URLScan databases for phishing or malware.',
  },
  web_complaints: {
    icon: '💬',
    label: 'Public Warnings Found',
    desc: 'AI analysis of search engine results detected matching scam allegations or negative buyer posts.',
  },
  suspicious_history: {
    icon: '🚩',
    label: 'Suspicious Trade Patterns',
    desc: 'Context patterns (such as advance-payment-only or lack of COD) indicate a high risk of transaction fraud.',
  },
};

const RISK_CONFIG = {
  safe: {
    label: 'LOW RISK (SAFE)',
    color: 'var(--color-safe)',
    bg: 'var(--color-safe-glow)',
    border: 'rgba(0,102,84,0.15)',
    icon: '✅',
    summary: 'No negative indicators found. Proceed with standard security caution.',
  },
  caution: {
    label: 'CAUTION',
    color: 'var(--color-caution)',
    bg: 'var(--color-caution-glow)',
    border: 'rgba(179,116,0,0.15)',
    icon: '⚠️',
    summary: 'Mild security flags detected. Avoid upfront payments if possible.',
  },
  high: {
    label: 'HIGH RISK',
    color: 'var(--color-danger)',
    bg: 'var(--color-danger-glow)',
    border: 'rgba(179,0,0,0.15)',
    icon: '🚨',
    summary: 'Severe risk patterns detected. Upfront payment is highly discouraged.',
  },
  confirmed: {
    label: 'CONFIRMED SCAM',
    color: 'var(--color-danger)',
    bg: 'var(--color-danger-glow)',
    border: 'rgba(179,0,0,0.15)',
    icon: '🚫',
    summary: 'Verified scam record exists. Do not send any money.',
  },
} as const;

export default function AISafetyScan({ query, mode }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [data, setData] = useState<ScanData | null>(null);
  const [loadingStep, setLoadingStep] = useState(0);

  const steps = [
    'Parsing query input details...',
    'Checking domain registry age (RDAP)...',
    'Checking Google Safe Browsing database...',
    'Checking URLScan security reports...',
    'Searching Web/Facebook complaint boards...',
    'Running risk intelligence model (Groq AI)...',
  ];

  const triggerScan = async () => {
    setLoading(true);
    setError(false);
    setData(null);
    setLoadingStep(0);

    try {
      const url = `/api/ai-scan?q=${encodeURIComponent(query)}&mode=${mode}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('API Error');
      const scanResult: ScanData = await res.json();
      setData(scanResult);
      setLoading(false);
    } catch {
      setError(true);
      setLoading(false);
    }
  };

  useEffect(() => {
    triggerScan();
  }, [query, mode]);

  // Loading animation step timer
  useEffect(() => {
    if (!loading) return;
    const interval = setInterval(() => {
      setLoadingStep((prev) => (prev < steps.length - 1 ? prev + 1 : prev));
    }, 1800);
    return () => clearInterval(interval);
  }, [loading]);

  if (loading) {
    return (
      <div style={{
        background: 'var(--color-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: '32px',
        marginBottom: '24px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
          <div style={{
            width: '20px',
            height: '20px',
            border: '2px solid var(--color-border)',
            borderTop: '2px solid var(--color-accent)',
            borderRadius: '50%',
            animation: 'shimmer 1.5s infinite linear', // fallback simple spinning animation
          }} className="animate-spin" />
          <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
            Scanning Web Signals via AI...
          </h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {steps.map((step, idx) => {
            const isCompleted = idx < loadingStep;
            const isActive = idx === loadingStep;
            return (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '12px', opacity: isCompleted ? 0.6 : isActive ? 1 : 0.3, transition: 'opacity 0.25s' }}>
                <div style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: isCompleted ? 'var(--color-safe)' : isActive ? 'var(--color-accent)' : 'var(--color-border)',
                }} />
                <span style={{ fontSize: '13px', color: 'var(--color-text-primary)', fontWeight: isActive ? 500 : 400 }}>{step}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        background: 'var(--color-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: '32px',
        textAlign: 'center',
        marginBottom: '24px',
      }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '16px' }}>⚠️</div>
        <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 8px' }}>
          Scan Connection Failed
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', margin: '0 auto 20px', maxWidth: '360px', lineHeight: 1.5 }}>
          We encountered an issue checking live databases. Some API limits may be active, or your network is blocked.
        </p>
        <button
          onClick={triggerScan}
          style={{
            padding: '10px 20px',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-pill)',
            color: 'var(--color-text-primary)',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          🔄 Try Scan Again
        </button>
      </div>
    );
  }

  if (!data) return null;

  const risk = RISK_CONFIG[data.riskVerdict] || RISK_CONFIG.caution;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Risk Verdict Card */}
      <div style={{
        background: risk.bg,
        border: `1px solid ${risk.border}`,
        borderRadius: 'var(--radius-xl)',
        padding: '32px',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifySpaceBetween: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.1em',
              color: risk.color,
              marginBottom: '10px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}>
              <span>{risk.icon}</span>
              {risk.label}
            </div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 10px' }}>
              AI Safety Verdict
            </h1>
            <p style={{ fontSize: '14px', color: 'var(--color-text-primary)', lineHeight: 1.6, margin: 0 }}>
              {data.explanation}
            </p>
          </div>
        </div>
      </div>

      {/* AI Flags */}
      <div style={{
        background: 'var(--color-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: '24px',
      }}>
        <h2 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 16px' }}>
          Detected Risk Signals
        </h2>
        {data.flags.length === 0 ? (
          <div style={{ fontSize: '13px', color: 'var(--color-safe)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>✓</span> No typical e-commerce scam markers were detected by the AI.
          </div>
        ) : (
          <div style={{ display: 'flex', flexType: 'column', flexDirection: 'column', gap: '16px' }}>
            {data.flags.map((flag) => {
              const details = FLAG_DETAILS[flag] || { icon: '🚩', label: flag, desc: 'Heuristic warning flag.' };
              return (
                <div key={flag} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '18px', flexShrink: 0, marginTop: '2px' }}>{details.icon}</span>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-danger)', marginBottom: '2px' }}>
                      {details.label}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                      {details.desc}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Diagnostics details */}
      <div style={{
        background: 'var(--color-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: '24px',
      }}>
        <h2 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 16px' }}>
          Diagnostic Scan Records
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <div style={{ background: 'var(--color-surface)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>DOMAIN AGE (WHOIS)</div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
              {data.whoisAgeDays !== undefined ? `${data.whoisAgeDays} days` : 'N/A (Skipped / Non-Domain)'}
            </div>
          </div>
          <div style={{ background: 'var(--color-surface)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>GOOGLE SAFE BROWSING</div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: data.safeBrowsingOk ? 'var(--color-safe)' : 'var(--color-danger)' }}>
              {data.safeBrowsingOk ? '✓ Safe' : '⚠ Dangerous / Blocked'}
            </div>
          </div>
          <div style={{ background: 'var(--color-surface)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>URLSCAN DB SCAN</div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: data.urlscanVerdict === 'clean' ? 'var(--color-safe)' : 'var(--color-danger)' }}>
              {data.urlscanVerdict.toUpperCase()}
            </div>
          </div>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '16px', textAlign: 'right' }}>
          Scan caching expires 24h from analyzed timestamp: {new Date(data.analyzedAt).toLocaleString()}
        </div>
      </div>

    </div>
  );
}
