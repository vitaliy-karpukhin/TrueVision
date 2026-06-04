import React, { useState, useRef, useEffect } from 'react';
import api from '../../api/client';
import { s } from './styles';
import './chat.css';
import { useT } from '../../locales/i18n.js';

const Icons = {
  Robot: ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#00E5FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v4M8 16h.01M16 16h.01" />
    </svg>
  ),
  Send: ({ disabled }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: disabled ? 0.3 : 1 }}>
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  ),
  Stars: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="#00E5FF" stroke="none">
      <path d="M12 3l1.91 5.89h6.19l-5.01 3.64 1.91 5.89-5-3.64-5 3.64 1.91-5.89-5.01-3.64h6.19z" />
    </svg>
  ),
};

function TypingIndicator() {
  return (
    <div style={{ ...s.botMsgRow, alignItems: 'center' }}>
      <div style={s.miniAvatar}><Icons.Robot size={16} /></div>
      <div style={{ ...s.botBubble, padding: '13px 18px', display: 'flex', alignItems: 'center', gap: 0 }}>
        <span style={dotStyle(0)} /><span style={dotStyle(1)} /><span style={dotStyle(2)} />
      </div>
    </div>
  );
}

function dotStyle(i) {
  return { display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#00E5FF', margin: '0 3px', animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` };
}

export default function AIChat() {
  const t = useT();
  const SUGGESTIONS = [t.chat_q1, t.chat_q2, t.chat_q3, t.chat_q4, t.chat_q5];

  const [messages, setMessages] = useState(null);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    setMessages([{ id: 1, text: t.chat_welcome, isBot: true }]);
  }, [t.chat_welcome]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = async (text) => {
    const query = (text ?? input).trim();
    if (!query || loading) return;
    setInput('');
    setMessages(prev => [...prev, { id: Date.now(), text: query, isBot: false }]);
    setLoading(true);
    try {
      const res = await api.post('/chat/query', { query });
      setMessages(prev => [...prev, { id: Date.now() + 1, text: res.data.answer, isBot: true }]);
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.message || '';
      const status = err?.response?.status;
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        text: `${t.chat_error}${status ? ` (${status})` : ''}: ${detail}`,
        isBot: true, error: true,
      }]);
    } finally {
      setLoading(false);
    }
  };

  const showSuggestions = messages?.length === 1 && !loading;
  const canSend = !loading && input.trim();

  if (!messages) return null;

  return (
    <div className="chat-outer">
      <div className="chat-inner">
        <div style={s.chatHeader}>
          <div style={s.botAvatar}><Icons.Robot size={22} /></div>
          <div style={s.headerInfo}>
            <h3 style={s.botName}>{t.chat_title}</h3>
            <div style={s.statusRow}>
              <span style={s.statusDot} className="status-dot-pulse" />
              <span style={s.statusText}>{t.chat_status}</span>
            </div>
          </div>
          <div style={s.poweredBadge}>
            <Icons.Stars />
            <span>{t.chat_powered}</span>
          </div>
        </div>

        <div style={s.messagesArea} className="chat-messages">
          {messages.map((msg) => (
            <div key={msg.id} style={msg.isBot ? s.botMsgRow : s.userMsgRow}>
              {msg.isBot && <div style={s.miniAvatar}><Icons.Robot size={16} /></div>}
              <div style={msg.isBot ? { ...s.botBubble, ...(msg.error ? { borderLeft: '3px solid #FC8181', color: '#FC8181' } : {}) } : s.userBubble}>
                {msg.text}
              </div>
            </div>
          ))}
          {loading && <TypingIndicator />}
          {showSuggestions && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px', paddingLeft: '40px' }}>
              {SUGGESTIONS.map((q) => (
                <button key={q} onClick={() => send(q)} className="chat-chip">{q}</button>
              ))}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div style={s.inputContainer}>
          <div style={s.inputWrapper}>
            <input
              className="chat-input"
              style={{ ...s.input, opacity: loading ? 0.6 : 1 }}
              placeholder={t.chat_placeholder}
              value={input}
              disabled={loading}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
            />
            <button onClick={() => send()} disabled={!canSend} style={{ ...s.sendBtn, color: canSend ? '#00E5FF' : '#374151' }} className={canSend ? 'send-btn-active' : ''}>
              <Icons.Send disabled={!canSend} />
            </button>
          </div>
          <p style={s.footerNote}>{t.chat_security}</p>
        </div>
      </div>
    </div>
  );
}
