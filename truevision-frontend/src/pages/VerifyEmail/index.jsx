import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../../api/client';
import Logo from '../../components/Logo.jsx';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading'); // loading | ok | error

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) { setStatus('error'); return; }

    api.get(`/auth/verify?token=${token}`)
      .then(() => {
        setStatus('ok');
        setTimeout(() => navigate('/login'), 3000);
      })
      .catch(() => setStatus('error'));
  }, []);

  const box = {
    minHeight: '100vh',
    background: '#0B0F17',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem',
    gap: '1.5rem',
  };

  const card = {
    background: '#151B28',
    border: '1px solid #1E2530',
    borderRadius: '24px',
    padding: '2.5rem 2rem',
    maxWidth: '420px',
    width: '100%',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1rem',
  };

  return (
    <div style={box}>
      <Logo />
      <div style={card}>
        {status === 'loading' && (
          <>
            <div style={{ width: 48, height: 48, border: '3px solid #1E2530', borderTopColor: '#00E5FF', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            <p style={{ color: '#6B7280', margin: 0 }}>Проверяем токен…</p>
          </>
        )}

        {status === 'ok' && (
          <>
            <div style={{ fontSize: '3rem' }}>✅</div>
            <h2 style={{ color: '#fff', margin: 0, fontSize: '1.2rem', fontWeight: '700' }}>Email подтверждён!</h2>
            <p style={{ color: '#6B7280', margin: 0, fontSize: '0.85rem' }}>Перенаправляем на страницу входа…</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={{ fontSize: '3rem' }}>❌</div>
            <h2 style={{ color: '#FC8181', margin: 0, fontSize: '1.2rem', fontWeight: '700' }}>Ссылка недействительна</h2>
            <p style={{ color: '#6B7280', margin: 0, fontSize: '0.85rem' }}>
              Токен истёк или уже был использован. Попробуйте зарегистрироваться снова.
            </p>
            <button
              onClick={() => navigate('/login')}
              style={{ marginTop: '0.5rem', background: '#00E5FF', border: 'none', borderRadius: '10px', color: '#0B0F17', padding: '10px 24px', fontWeight: '700', cursor: 'pointer', fontSize: '0.9rem' }}
            >
              На страницу входа
            </button>
          </>
        )}
      </div>
    </div>
  );
}
