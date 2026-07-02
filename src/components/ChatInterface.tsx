// src/components/ChatInterface.tsx
import React, { useState, useRef, useEffect } from 'react';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

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
        setMessages(prev => [...prev, { role: 'assistant', content: data.message }]);
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

      {/* Messages Window */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ background: '#fafafa' }}>
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
            <div key={idx} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
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

      {/* Warning Area */}
      {isSessionExhausted && (
        <div className="px-4 py-2 border-t text-xs text-center font-medium bg-amber-50 text-amber-700 border-amber-200">
          🔒 You have reached the maximum of 20 messages for this chat session. Thank you for using ScamShield!
        </div>
      )}

      {uploadError && (
        <div className="px-4 py-1.5 border-t text-xs text-red-600 bg-red-50 border-red-200 flex justify-between items-center">
          <span>❌ {uploadError}</span>
          <button onClick={() => setUploadError(null)} className="font-bold cursor-pointer text-red-800">Dismiss</button>
        </div>
      )}

      {/* Upload Preview */}
      {uploadedName && (
        <div className="px-4 py-2 border-t flex items-center justify-between text-xs bg-emerald-50 text-emerald-800 border-emerald-100">
          <span className="flex items-center gap-1.5">
            📎 Evidence Ready: <strong>{uploadedName}</strong>
          </span>
          <button onClick={removeUploadedFile} className="text-[10px] uppercase font-bold text-red-700 hover:text-red-900 cursor-pointer">
            Remove
          </button>
        </div>
      )}

      {/* Footer / Input area */}
      <form onSubmit={handleSubmit} className="border-t p-3 bg-white" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex items-center gap-2">
          {/* File Upload Button */}
          <button
            type="button"
            disabled={isSessionExhausted || isUploading}
            onClick={() => fileInputRef.current?.click()}
            className="w-10 h-10 rounded-lg flex items-center justify-center border border-default hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
            style={{ borderColor: 'var(--color-border)' }}
            title="Upload screenshot receipt evidence"
          >
            {isUploading ? (
              <span className="w-4 h-4 border-2 border-t-transparent border-indigo-500 rounded-full animate-spin"></span>
            ) : (
              <span className="text-lg text-slate-500">📎</span>
            )}
          </button>
          
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
          />

          {/* Text Input */}
          <div className="flex-1 relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value.slice(0, 500))}
              disabled={isSessionExhausted || isTyping}
              placeholder={isSessionExhausted ? "Session complete." : "Type a message (e.g. 'Is FakeShopBD reported?')..."}
              className="w-full h-10 px-3.5 pr-14 text-[13px] border border-default rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:border-indigo-500 transition-all disabled:opacity-60"
              style={{ borderColor: 'var(--color-border)' }}
            />
            {/* Characters Indicator */}
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-mono">
              {input.length}/500
            </span>
          </div>

          {/* Send Button */}
          <button
            type="submit"
            disabled={isSessionExhausted || isTyping || (!input.trim() && !uploadedKey)}
            className="h-10 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-[13px] shadow-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            style={{ background: '#6366f1' }}
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
