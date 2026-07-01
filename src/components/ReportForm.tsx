'use client';
import { useState, useRef } from 'react';

type ReporterType = 'BUYER' | 'SELLER';
type Step = 'type' | 'details' | 'evidence' | 'submitted';

interface Props {
  prefillEntity?: string;
  prefillMode?: string;
}

export default function ReportForm({ prefillEntity = '', prefillMode = 'buyer' }: Props) {
  const [step, setStep]               = useState<Step>('type');
  const [reporterType, setReporterType] = useState<ReporterType>(
    prefillMode === 'seller' ? 'SELLER' : 'BUYER'
  );
  const [entityIdentifier, setEntityIdentifier] = useState(prefillEntity);
  const [entityType, setEntityType]   = useState('');
  const [incidentDate, setIncidentDate] = useState('');
  const [amountLost, setAmountLost]   = useState('');
  const [complaintText, setComplaintText] = useState('');
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidencePreview, setEvidencePreview] = useState<string | null>(null);
  const [submitting, setSubmitting]   = useState(false);
  const [errors, setErrors]           = useState<string[]>([]);
  const [referenceId, setReferenceId] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const isBuyer = reporterType === 'BUYER';

  const entityTypeOptions = isBuyer
    ? ['Facebook Page / Shop', 'Online Store', 'bKash Number', 'Nagad Number', 'Rocket Number', 'Other']
    : ['Buyer Phone Number', 'Facebook Profile', 'Other'];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setErrors(['File must be under 5MB']);
      return;
    }
    setEvidenceFile(file);
    setErrors([]);
    const reader = new FileReader();
    reader.onload = ev => setEvidencePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setErrors([]);
    try {
      const fd = new FormData();
      fd.append('reporterType',     reporterType);
      fd.append('entityIdentifier', entityIdentifier);
      fd.append('entityType',       entityType);
      fd.append('incidentDate',     incidentDate);
      fd.append('amountLost',       amountLost);
      fd.append('complaintText',    complaintText);
      if (evidenceFile) fd.append('evidence', evidenceFile);

      const res  = await fetch('/api/report', { method: 'POST', body: fd });
      const data = await res.json() as { ok: boolean; errors?: string[]; referenceId?: string };

      if (!data.ok) { setErrors(data.errors ?? ['Unknown error']); return; }
      window.location.href = `/report-success?ref=${data.referenceId ?? ''}`;
    } catch {
      setErrors(['Network error. Please try again.']);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Styles ──────────────────────────────────────────────────────────
  const card: React.CSSProperties = {
    background: 'var(--color-card)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-lg)',
    padding: '32px',
  };
  const label: React.CSSProperties = {
    display: 'block',
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    marginBottom: '8px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  };
  const input: React.CSSProperties = {
    width: '100%',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    padding: '12px 14px',
    fontSize: '14px',
    color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-sans)',
    outline: 'none',
    boxSizing: 'border-box',
  };
  const btnPrimary: React.CSSProperties = {
    padding: '13px 28px',
    background: 'var(--color-danger)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius-pill)',
    fontSize: '14px',
    fontWeight: 600,
    fontFamily: 'var(--font-sans)',
    cursor: 'pointer',
    transition: 'opacity 0.2s',
    boxShadow: '0 4px 16px rgba(230,57,70,0.3)',
  };
  const btnSecondary: React.CSSProperties = {
    padding: '13px 24px',
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-pill)',
    fontSize: '14px',
    fontWeight: 500,
    fontFamily: 'var(--font-sans)',
    cursor: 'pointer',
  };

  // ── Step: submitted ─────────────────────────────────────────────────
  if (step === 'submitted') {
    return (
      <div style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', textAlign: 'center' }} className="p-6 sm:p-10">
        <div style={{ fontSize: '3rem', marginBottom: '16px' }}>✅</div>
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--color-safe)', textTransform: 'uppercase', marginBottom: '12px' }}>
          Report Submitted
        </div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 12px' }}>
          Thank you for reporting
        </h2>
        <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', lineHeight: 1.6, maxWidth: '400px', margin: '0 auto 24px' }}>
          Your report is under admin review. Once verified, it will appear in search results to protect other users.
        </p>
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '16px', display: 'inline-block', marginBottom: '28px' }}>
          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>Your reference ID</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>#{referenceId}</div>
        </div>
        <br />
        <a href="/" style={{ ...btnPrimary, textDecoration: 'none', display: 'inline-block' }}>← Back to Search</a>
      </div>
    );
  }

  // ── Step: type ───────────────────────────────────────────────────────
  if (step === 'type') {
    return (
      <div style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)' }} className="p-5 sm:p-8">
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 8px' }}>
          Who are you reporting?
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', margin: '0 0 28px', lineHeight: 1.5 }}>
          Select the type of report you want to file.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-7">
          {(['BUYER', 'SELLER'] as ReporterType[]).map(type => {
            const active = reporterType === type;
            const isBuyerOpt = type === 'BUYER';
            return (
              <button
                key={type}
                onClick={() => setReporterType(type)}
                style={{
                  padding: '20px',
                  background: active
                    ? isBuyerOpt ? 'rgba(230,57,70,0.08)' : 'rgba(123,104,238,0.08)'
                    : 'var(--color-surface)',
                  border: `1.5px solid ${active
                    ? isBuyerOpt ? 'var(--color-danger)' : 'var(--color-accent)'
                    : 'var(--color-border)'}`,
                  borderRadius: 'var(--radius-lg)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>{isBuyerOpt ? '🛒' : '🏪'}</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                  {isBuyerOpt ? 'I was scammed by a seller' : 'A buyer scammed me'}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
                  {isBuyerOpt
                    ? 'Report a fraudulent shop, page, or wallet number'
                    : 'Report a buyer who refused delivery or placed a fake order'}
                </div>
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button style={btnPrimary} onClick={() => setStep('details')}>
            Continue →
          </button>
        </div>
      </div>
    );
  }

  // ── Step: details ────────────────────────────────────────────────────
  if (step === 'details') {
    return (
      <div style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)' }} className="p-5 sm:p-8">
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '24px' }}>
          <span style={{ fontSize: '20px' }}>{isBuyer ? '🛒' : '🏪'}</span>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
            {isBuyer ? 'Seller Fraud Details' : 'Buyer Scam Details'}
          </h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label style={label}>{isBuyer ? 'Shop / Page / Wallet Number *' : 'Buyer Phone or Profile *'}</label>
            <input
              style={input}
              type="text"
              value={entityIdentifier}
              onChange={e => setEntityIdentifier(e.target.value)}
              placeholder={isBuyer ? 'e.g. TrendyClosetBD, facebook.com/shop, 01712345678' : 'e.g. 01987654321, facebook.com/buyerprofile'}
            />
          </div>

          <div>
            <label style={label}>Type *</label>
            <select
              style={{ ...input, cursor: 'pointer' }}
              value={entityType}
              onChange={e => setEntityType(e.target.value)}
            >
              <option value="">Select type…</option>
              {entityTypeOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label style={label}>Date of Incident *</label>
              <input style={input} type="date" value={incidentDate} onChange={e => setIncidentDate(e.target.value)} max={new Date().toISOString().split('T')[0]} />
            </div>
            {isBuyer && (
              <div>
                <label style={label}>Amount Lost (৳)</label>
                <input style={input} type="number" value={amountLost} onChange={e => setAmountLost(e.target.value)} placeholder="e.g. 2500" min="0" />
              </div>
            )}
          </div>

          <div>
            <label style={label}>What Happened? *</label>
            <textarea
              style={{ ...input, minHeight: '120px', resize: 'vertical' }}
              value={complaintText}
              onChange={e => setComplaintText(e.target.value)}
              placeholder={isBuyer
                ? 'Describe the fraud clearly. What did you order? What happened after payment? What did you lose?'
                : 'Describe the incident. When did they order? How many times did they refuse delivery? What was the cost to you?'}
            />
            <div style={{ fontSize: '12px', color: complaintText.length < 20 ? 'var(--color-text-muted)' : 'var(--color-safe)', marginTop: '4px' }}>
              {complaintText.length} / 20 min characters
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'space-between', marginTop: '28px' }}>
          <button style={btnSecondary} onClick={() => setStep('type')}>← Back</button>
          <button
            style={{ ...btnPrimary, opacity: (!entityIdentifier || !entityType || !incidentDate || complaintText.length < 20) ? 0.5 : 1 }}
            disabled={!entityIdentifier || !entityType || !incidentDate || complaintText.length < 20}
            onClick={() => setStep('evidence')}
          >
            Continue →
          </button>
        </div>
      </div>
    );
  }

  // ── Step: evidence ────────────────────────────────────────────────────
  return (
    <div style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)' }} className="p-5 sm:p-8">
      <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 8px' }}>
        Upload Evidence Screenshot
      </h2>
      <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', margin: '0 0 24px', lineHeight: 1.5 }}>
        This is required to prevent false reports. Upload a screenshot of your chat, payment confirmation, or delivery refusal proof.
      </p>

      {errors.length > 0 && (
        <div style={{ background: 'rgba(230,57,70,0.08)', border: '1px solid rgba(230,57,70,0.25)', borderRadius: 'var(--radius-md)', padding: '12px 16px', marginBottom: '20px' }}>
          {errors.map((e, i) => <p key={i} style={{ margin: 0, fontSize: '13px', color: 'var(--color-danger)' }}>⚠ {e}</p>)}
        </div>
      )}

      {/* Drop zone */}
      <div
        onClick={() => fileRef.current?.click()}
        style={{
          border: `2px dashed ${evidenceFile ? 'var(--color-safe)' : 'var(--color-border)'}`,
          borderRadius: 'var(--radius-lg)',
          textAlign: 'center',
          cursor: 'pointer',
          background: evidenceFile ? 'rgba(6,214,160,0.04)' : 'var(--color-surface)',
          transition: 'all 0.2s',
          marginBottom: '20px',
        }}
        className="p-6 sm:p-8"
      >
        {evidencePreview ? (
          <div>
            <img src={evidencePreview} alt="Evidence preview" style={{ maxHeight: '200px', maxWidth: '100%', borderRadius: 'var(--radius-md)', marginBottom: '12px' }} />
            <div style={{ fontSize: '13px', color: 'var(--color-safe)', fontWeight: 600 }}>✓ {evidenceFile?.name}</div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>Click to replace</div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: '2rem', marginBottom: '12px' }}>📎</div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>Click to upload screenshot</div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>PNG, JPG, WEBP — max 5MB</div>
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
      </div>

      {/* Summary before submit */}
      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '16px', marginBottom: '24px', fontSize: '13px' }}>
        <div style={{ fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '11px' }}>Report Summary</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: 'var(--color-text-secondary)' }}>
          <div><span style={{ color: 'var(--color-text-muted)' }}>Type:</span> {isBuyer ? 'Buyer reporting a seller' : 'Seller reporting a buyer'}</div>
          <div><span style={{ color: 'var(--color-text-muted)' }}>Entity:</span> <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>{entityIdentifier}</span></div>
          <div><span style={{ color: 'var(--color-text-muted)' }}>Date:</span> {incidentDate}</div>
          {amountLost && <div><span style={{ color: 'var(--color-text-muted)' }}>Amount lost:</span> ৳{amountLost}</div>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '12px', justifyContent: 'space-between' }}>
        <button style={btnSecondary} onClick={() => setStep('details')}>← Back</button>
        <button
          style={{ ...btnPrimary, opacity: (!evidenceFile || submitting) ? 0.6 : 1 }}
          disabled={!evidenceFile || submitting}
          onClick={handleSubmit}
        >
          {submitting ? 'Submitting…' : '🔒 Submit Report'}
        </button>
      </div>
    </div>
  );
}
