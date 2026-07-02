// src/components/ChatInterface.tsx
import React, { useState, useRef, useEffect } from 'react';

interface ReportCardData {
  id: string;
  entityIdentifier: string;
  entityType: string;
  incidentDate: string;
  amountLost?: number;
  complaintText: string;
  evidenceFileName?: string;
}

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  reports?: ReportCardData[];
}

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hello! I am ScamShield's Interactive AI Agent. You can ask me to search for scam records, or describe a scam you've experienced and I'll guide you through filing a report inline. How can I help you today?"
    }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [uploadedKey, setUploadedKey] = useState<string | null>(null);
  const [uploadedName, setUploadedName] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Lightbox event listener
  useEffect(() => {
    const handleOpenLightbox = (e: Event) => {
      const url = (e as CustomEvent).detail;
      setLightboxImg(url);
    };
    window.addEventListener('open-chat-lightbox', handleOpenLightbox);
    return () => {
      window.removeEventListener('open-chat-lightbox', handleOpenLightbox);
    };
  }, []);

  const maxMessages = 20;
  const userMessagesCount = messages.filter(m => m.role === 'user').length;
  const isSessionExhausted = userMessagesCount >= maxMessages;

  // Simple Markdown Renderer
  const renderMessageContent = (text: string) => {
    // Escape HTML first to prevent XSS
    let escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Bold text (**text**)
    escaped = escaped.replace(/\*\*([\s\S]*?)\*\*/g, '<strong>$1</strong>');
    
    // Line breaks
    escaped = escaped.replace(/\n/g, '<br/>');

    // Bullet points
    escaped = escaped.replace(/^\*\s(.*)$/gm, '• $1');

    return <span dangerouslySetInnerHTML={{ __html: escaped }} />;
  };

  // Handle File Upload (Screenshots)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);

    // ── 1. Client-Side Size Check (5MB) ──
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('File exceeds 5MB size limit.');
      return;
    }

    // ── 2. Client-Side Type Check ──
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setUploadError('Only JPEG, PNG, or WEBP image files are allowed.');
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/chat/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setUploadedKey(data.key);
        setUploadedName(data.filename);
      } else {
        setUploadError(data.error || 'Failed to upload image.');
      }
    } catch (err) {
      console.error('[ChatUI] Upload error:', err);
      setUploadError('Failed to upload file due to network error.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeUploadedFile = () => {
    setUploadedKey(null);
    setUploadedName(null);
    setUploadError(null);
  };

  // Submit User Message
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() && !uploadedKey) return;
    if (isSessionExhausted || isTyping) return;

    const userMessageContent = input.trim() || `[Attached file: ${uploadedName}]`;
    const newMessages: Message[] = [...messages, { role: 'user', content: userMessageContent }];
    setMessages(newMessages);
    setInput('');
    setIsTyping(true);

    // Temporary capture R2 keys
    const currentKey = uploadedKey;
    const currentName = uploadedName;
    
    // Clear upload state so user can attach something else next time if needed
    setUploadedKey(null);
    setUploadedName(null);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          uploadedFileKey: currentKey,
          uploadedFileName: currentName
        })
      });

      const data = await res.json();
      if (res.ok) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.message, reports: data.reports }]);
      } else {
        setMessages(prev => [...prev, { role: 'system', content: data.message || 'An error occurred.' }]);
      }
    } catch (err) {
      console.error('[ChatUI] Send message error:', err);
      setMessages(prev => [...prev, { role: 'system', content: 'Could not connect to the server. Please check your connection.' }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="flex flex-col h-[600px] max-w-3xl mx-auto rounded-xl border border-default shadow-sm bg-white overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between border-b" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-1.5" style={{ color: 'var(--color-text-primary)' }}>
            <span style={{ color: 'var(--color-danger)' }}>✨</span> ScamShield Agent
          </h2>
          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Conversational Reporting & Search Assistant</p>
        </div>
        <div className="text-[11px] font-mono px-2 py-0.5 rounded" style={{ background: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
          {userMessagesCount} / {maxMessages} messages
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 animate-fadeIn" style={{ background: '#fafafa' }}>
        {messages.map((m, idx) => {
          if (m.role === 'system') {
            return (
              <div key={idx} className="flex justify-center">
                <div className="text-xs px-3 py-1.5 rounded-md border border-red-200 bg-red-50 text-red-700 max-w-md text-center">
                  ⚠️ {m.content}
                </div>
              </div>
            );
          }

          const isUser = m.role === 'user';
          return (
            <div key={idx} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-1.5`}>
              <div 
                className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[13px] shadow-sm leading-relaxed border ${
                  isUser 
                    ? 'text-white border-transparent' 
                    : 'text-left bg-white border-default'
                }`}
                style={{ 
                  background: isUser ? '#6366f1' : 'white',
                  color: isUser ? '#ffffff' : 'var(--color-text-primary)',
                  borderColor: isUser ? 'transparent' : 'var(--color-border)'
                }}
              >
                {renderMessageContent(m.content)}
              </div>
              {!isUser && m.reports && m.reports.length > 0 && renderReportCards(m.reports)}
            </div>
          );
        })}

        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-white border border-default rounded-2xl px-4 py-3 shadow-sm flex items-center gap-1" style={{ borderColor: 'var(--color-border)' }}>
              <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
              <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
              <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="p-3 border-t bg-white" style={{ borderColor: 'var(--color-border)' }}>
        {uploadError && (
          <div className="mb-2 px-3 py-1.5 bg-red-50 border border-red-100 text-red-600 rounded-lg text-xs flex justify-between items-center">
            <span>{uploadError}</span>
            <button type="button" onClick={() => setUploadError(null)} className="font-bold text-red-800 hover:opacity-75">&times;</button>
          </div>
        )}
        {uploadedName && (
          <div className="mb-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-xs flex justify-between items-center font-semibold">
            <span className="flex items-center gap-1">📎 Evidence Ready: {uploadedName}</span>
            <button type="button" onClick={removeUploadedFile} className="font-bold text-emerald-800 hover:opacity-75 hover:scale-110 transition-transform">REMOVE</button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/jpeg,image/png,image/webp" />
          <button
            type="button"
            disabled={isSessionExhausted || isTyping || isUploading}
            onClick={() => fileInputRef.current?.click()}
            className="w-10 h-10 border border-default rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
            style={{ borderColor: 'var(--color-border)' }}
            title="Upload screenshot receipt evidence"
          >
            {isUploading ? <span className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></span> : "📎"}
          </button>
          <div className="flex-1 relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value.slice(0, 500))}
              disabled={isSessionExhausted || isTyping}
              placeholder={isSessionExhausted ? "Session complete." : "Type a message..."}
              className="w-full h-10 px-3.5 pr-14 text-[13px] border border-default rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:border-indigo-500 transition-all disabled:opacity-60"
              style={{ borderColor: 'var(--color-border)' }}
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-mono">
              {input.length}/500
            </span>
          </div>
          <button
            type="submit"
            disabled={isSessionExhausted || isTyping || (!input.trim() && !uploadedKey)}
            className="h-10 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-[13px] shadow-sm transition-colors cursor-pointer disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>

      {lightboxImg && (
        <div className="fixed inset-0 bg-black/90 z-[99999] flex items-center justify-center cursor-pointer select-none" onClick={() => setLightboxImg(null)}>
          <span className="absolute top-6 right-6 text-white text-4xl font-bold hover:opacity-70 cursor-pointer">&times;</span>
          <img src={lightboxImg} alt="Full-size evidence" className="max-w-[85%] max-h-[85%] object-contain rounded-lg shadow-2xl cursor-default" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

function parseScrapedComplaint(text: string) {
  const result = { originalUrl: '', posterName: '', caption: text || '', photos: [] as string[] };
  if (!text) return result;
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      result.originalUrl = parsed.postUrl || '';
      result.posterName = parsed.posterName || '';
      result.caption = parsed.postText || '';
      result.photos = parsed.images || [];
      return result;
    } catch {}
  }
  return result;
}

function renderReportCards(reports: ReportCardData[]) {
  const triggerLightbox = (url: string) => {
    const event = new CustomEvent('open-chat-lightbox', { detail: url });
    window.dispatchEvent(event);
  };

  return (
    <div className="mt-2 space-y-2.5 w-full">
      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider pl-1">
        🔍 Matched Database Records ({reports.length})
      </div>
      <div className="flex flex-col gap-2.5">
        {reports.map((report) => {
          const trimmed = (report.complaintText || '').trim();
          const isScraped = trimmed.startsWith('[Scraped') || (trimmed.startsWith('{') && trimmed.endsWith('}'));
          let displayCaption = report.complaintText;
          let scrapedPhotos: string[] = [];
          if (isScraped) {
            const parsed = parseScrapedComplaint(report.complaintText);
            displayCaption = parsed.caption;
            scrapedPhotos = parsed.photos;
          }
          const allImages: string[] = [];
          if (report.evidenceFileName && !report.evidenceFileName.startsWith('http') && !isScraped) {
            allImages.push(`/api/evidence?key=${encodeURIComponent(report.evidenceFileName)}`);
          }
          scrapedPhotos.forEach((p) => {
            const renderUrl = p.startsWith('http') ? p : `/api/evidence?key=${encodeURIComponent(p)}`;
            allImages.push(renderUrl);
          });
          return (
            <div key={report.id} className="bg-white border border-default rounded-xl p-4 shadow-sm text-left text-slate-800 space-y-3 w-full max-w-md" style={{ borderColor: 'var(--color-border)' }}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-100 uppercase tracking-wider">Verified Scam</span>
                <span className="text-[10px] font-mono text-slate-400">#{report.id.slice(0, 8).toUpperCase()}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                <div>
                  <div className="text-[9px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">Entity</div>
                  <div className="font-semibold text-slate-900 break-all">{report.entityIdentifier}</div>
                </div>
                <div>
                  <div className="text-[9px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">Type</div>
                  <div className="text-slate-600">{report.entityType}</div>
                </div>
                <div>
                  <div className="text-[9px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">Incident Date</div>
                  <div className="text-slate-600">{report.incidentDate}</div>
                </div>
                {report.amountLost && (
                  <div>
                    <div className="text-[9px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">Amount Lost</div>
                    <div className="font-bold text-red-600">৳{report.amountLost.toLocaleString()}</div>
                  </div>
                )}
              </div>
              <div className="text-xs border-t pt-2.5" style={{ borderColor: 'var(--color-border)' }}>
                <div className="text-[9px] text-slate-400 uppercase font-bold tracking-wider mb-1">Details</div>
                <div className="text-slate-700 leading-relaxed whitespace-pre-wrap">{displayCaption}</div>
              </div>
              {allImages.length > 0 && (
                <div className="border-t pt-2.5" style={{ borderColor: 'var(--color-border)' }}>
                  <div className="text-[9px] text-slate-400 uppercase font-bold tracking-wider mb-2">Evidence ({allImages.length})</div>
                  <div className="flex gap-2 flex-wrap">
                    {allImages.map((imgUrl, i) => (
                      <img key={i} src={imgUrl} alt="Evidence" className="w-12 h-12 object-cover rounded-md border border-slate-200 cursor-zoom-in hover:opacity-85" onClick={() => triggerLightbox(imgUrl)} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
