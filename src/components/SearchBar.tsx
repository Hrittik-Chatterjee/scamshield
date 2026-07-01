'use client';
import { useState } from 'react';

type Mode = 'buyer' | 'seller';

export default function SearchBar() {
  const [mode, setMode] = useState<Mode>('buyer');
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    window.location.href = `/search?q=${encodeURIComponent(query.trim())}&mode=${mode}`;
  };

  const buyerPlaceholder = 'Shop name, Facebook page link, or bKash/Nagad number…';
  const sellerPlaceholder = 'Buyer phone number or Facebook profile link…';

  return (
    <div style={{ width: '100%', maxWidth: '680px', margin: '0 auto' }} className="px-4">

      {/* Mode Toggle */}
      <div style={{
        display: 'flex',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-pill)',
        padding: '4px',
        marginBottom: '16px',
        width: 'fit-content',
        margin: '0 auto 16px',
      }}>
        <button
          onClick={() => setMode('buyer')}
          className="px-3 py-1.5 sm:px-5 sm:py-2 text-[11px] sm:text-xs md:text-[13px]"
          style={{
            borderRadius: 'var(--radius-pill)',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 500,
            fontFamily: 'var(--font-sans)',
            transition: 'all 0.2s',
            background: mode === 'buyer' ? 'var(--color-danger)' : 'transparent',
            color: mode === 'buyer' ? 'white' : 'var(--color-text-secondary)',
            boxShadow: mode === 'buyer' ? '0 0 16px rgba(230,57,70,0.3)' : 'none',
          }}
        >
          🛒 <span className="hidden xs:inline">Buyer — </span>Check Shop
        </button>
        <button
          onClick={() => setMode('seller')}
          className="px-3 py-1.5 sm:px-5 sm:py-2 text-[11px] sm:text-xs md:text-[13px]"
          style={{
            borderRadius: 'var(--radius-pill)',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 500,
            fontFamily: 'var(--font-sans)',
            transition: 'all 0.2s',
            background: mode === 'seller' ? 'var(--color-accent)' : 'transparent',
            color: mode === 'seller' ? 'white' : 'var(--color-text-secondary)',
            boxShadow: mode === 'seller' ? '0 0 16px rgba(123,104,238,0.3)' : 'none',
          }}
        >
          🏪 <span className="hidden xs:inline">Seller — </span>Check Buyer
        </button>
      </div>

      {/* Mode Description */}
      <p style={{
        textAlign: 'center',
        fontSize: '13px',
        color: 'var(--color-text-muted)',
        marginBottom: '20px',
        minHeight: '18px',
        transition: 'all 0.2s',
      }} className="px-2">
        {mode === 'buyer'
          ? 'Search by shop name, Facebook page, or mobile wallet number before sending payment'
          : 'Search a buyer\'s phone number or profile to check for delivery fraud reports'}
      </p>

      {/* Search Form */}
      <form onSubmit={handleSubmit}>
        <div style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          background: 'var(--color-card)',
          border: `1.5px solid ${focused
            ? mode === 'buyer' ? 'var(--color-danger)' : 'var(--color-accent)'
            : 'var(--color-border)'}`,
          borderRadius: 'var(--radius-xl)',
          transition: 'all 0.25s',
          boxShadow: focused
            ? mode === 'buyer'
              ? '0 0 0 4px rgba(179,0,0,0.08), 0 8px 32px rgba(25,25,33,0.08)'
              : '0 0 0 4px rgba(24,99,220,0.08), 0 8px 32px rgba(25,25,33,0.08)'
            : '0 4px 24px rgba(25,25,33,0.05)',
        }}>
          {/* Search Icon */}
          <span className="pl-3 sm:pl-5 text-sm sm:text-lg" style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}>
            🔍
          </span>

          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={mode === 'buyer' ? buyerPlaceholder : sellerPlaceholder}
            autoComplete="off"
            spellCheck={false}
            className="py-3 px-2 sm:py-[18px] sm:px-4 text-xs sm:text-[15px]"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--color-text-primary)',
              fontFamily: 'var(--font-sans)',
              caretColor: mode === 'buyer' ? 'var(--color-danger)' : 'var(--color-accent)',
            }}
          />

          {/* Clear Button */}
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-text-muted)',
                padding: '0 8px',
                fontSize: '18px',
                lineHeight: 1,
              }}
              aria-label="Clear search"
            >
              ×
            </button>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            className="m-1 py-2 px-3 sm:m-1.5 sm:py-3 sm:px-6 text-xs sm:text-[14px]"
            style={{
              background: mode === 'buyer' ? 'var(--color-danger)' : 'var(--color-accent)',
              color: 'white',
              border: 'none',
              borderRadius: 'var(--radius-lg)',
              fontWeight: 600,
              fontFamily: 'var(--font-sans)',
              cursor: 'pointer',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              boxShadow: mode === 'buyer'
                ? '0 4px 12px rgba(230,57,70,0.35)'
                : '0 4px 12px rgba(123,104,238,0.35)',
            }}
            onMouseOver={e => {
              (e.target as HTMLElement).style.transform = 'scale(1.02)';
              (e.target as HTMLElement).style.opacity = '0.9';
            }}
            onMouseOut={e => {
              (e.target as HTMLElement).style.transform = 'scale(1)';
              (e.target as HTMLElement).style.opacity = '1';
            }}
          >
            {mode === 'buyer' ? 'Check Safety' : 'Check Buyer'}
          </button>
        </div>
      </form>

      {/* Quick examples */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', marginTop: '16px' }}>
        <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Try:</span>
        {(mode === 'buyer'
          ? ['01712345678', 'TrendyClosetBD', 'facebook.com/shopname']
          : ['01987654321', 'facebook.com/buyerprofile']
        ).map(example => (
          <button
            key={example}
            onClick={() => setQuery(example)}
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-pill)',
              padding: '3px 12px',
              fontSize: '12px',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              transition: 'all 0.15s',
            }}
            onMouseOver={e => {
              (e.target as HTMLElement).style.borderColor = mode === 'buyer'
                ? 'var(--color-danger)' : 'var(--color-accent)';
              (e.target as HTMLElement).style.color = 'var(--color-text-primary)';
            }}
            onMouseOut={e => {
              (e.target as HTMLElement).style.borderColor = 'var(--color-border)';
              (e.target as HTMLElement).style.color = 'var(--color-text-secondary)';
            }}
          >
            {example}
          </button>
        ))}
      </div>
    </div>
  );
}
