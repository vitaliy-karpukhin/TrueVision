import React, { useState, useEffect, useRef } from 'react';
import { useLang } from '../../context/LangContext.jsx';
import { PROFILE_T } from '../../locales/profile/translations';
import { s } from './styles';
import SuccessOverlay from '../../components/SuccessOverlay.jsx';
import api from '../../api/client';

const I = {
  User:     (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  Building: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 22V12h6v10M3 9h18"/></svg>,
  Lock:     (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  File:     (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  Card:     (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  Calendar: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  Star:     (p) => <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" {...p}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  Camera:   (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>,
};

const DE = (lang) => lang === 'de';

function Field({ label, value, onChange, disabled, type = 'text' }) {
  const [focused, setFocused] = React.useState(false);
  return (
    <div>
      <div style={s.fieldLabel}>{label}</div>
      <input
        type={type}
        value={value || ''}
        disabled={disabled}
        onChange={e => onChange && onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{ ...s.input(disabled), borderColor: focused ? 'rgba(0,229,255,0.4)' : 'rgba(255,255,255,0.07)' }}
      />
    </div>
  );
}

export default function Profile() {
  const { lang } = useLang();
  const fileInputRef = useRef(null);
  const [loading, setLoading]       = useState(true);
  const [showSuccess, setShowSuccess] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [user, setUser] = useState({
    first_name: '', last_name: '', email: '', phone: '',
    avatar_url: '', company: { name: '', position: '', tax_id: '', iban: '' },
  });
  const [stats, setStats] = useState(null);

  // Password
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew]         = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwError, setPwError]     = useState('');
  const [pwOk, setPwOk]           = useState(false);
  const [pwSaving, setPwSaving]   = useState(false);

  const t = PROFILE_T[lang] || PROFILE_T.ru;
  const token = () => localStorage.getItem('access_token') || localStorage.getItem('token');

  const syncStorage = (u) => {
    localStorage.setItem('user', JSON.stringify(u));
    window.dispatchEvent(new Event('storage'));
  };

  useEffect(() => {
    const tk = token();
    if (!tk) { setLoading(false); return; }
    Promise.all([
      api.get('/auth/me').then(r => r.data),
      api.get('/auth/stats').then(r => r.data).catch(() => null),
    ]).then(([data, st]) => {
      setUser({ ...data, company: data.company || { name: '', position: '', tax_id: '' } });
      syncStorage(data);
      if (st) setStats(st);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const form = new FormData();
    form.append('avatar', file);
    const { data: d } = await api.post('/auth/upload-avatar', form);
    const u = { ...user, avatar_url: d.avatar_url };
    setUser(u); syncStorage(u);
    setShowSuccess(true); setTimeout(() => setShowSuccess(false), 2000);
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const { data } = await api.put('/auth/update', { first_name: user.first_name, last_name: user.last_name, phone: user.phone, avatar_url: user.avatar_url, company: user.company });
      syncStorage(data); setShowSuccess(true); setTimeout(() => setShowSuccess(false), 2000);
    } finally { setSavingProfile(false); }
  };

  const handlePasswordSave = async () => {
    setPwError('');
    if (pwNew !== pwConfirm) { setPwError(DE(lang) ? 'Passwörter stimmen nicht überein' : 'Пароли не совпадают'); return; }
    if (pwNew.length < 6)    { setPwError(DE(lang) ? 'Mindestens 6 Zeichen' : 'Минимум 6 символов'); return; }
    setPwSaving(true);
    try {
      try {
        await api.post('/auth/change-password', { current_password: pwCurrent, new_password: pwNew });
        setPwCurrent(''); setPwNew(''); setPwConfirm(''); setPwOk(true); setTimeout(() => setPwOk(false), 3000);
      } catch (e) { setPwError(e.response?.data?.detail || 'Ошибка'); }
    } finally { setPwSaving(false); }
  };

  if (loading) return null;

  const initials = (user.first_name?.[0] || '') + (user.last_name?.[0] || '') || 'U';
  const memberSince = stats?.member_since
    ? new Date(stats.member_since).toLocaleDateString(DE(lang) ? 'de-DE' : 'ru-RU', { year: 'numeric', month: 'long' })
    : '—';

  const pwReady = pwCurrent && pwNew && pwConfirm && !pwSaving;

  return (
    <div style={s.container}>

      {/* ── Hero ── */}
      <div style={s.hero}>
        <div style={s.heroBg} />
        <div style={s.heroRow}>
          <div style={s.avatarWrap} onClick={() => fileInputRef.current?.click()}>
            <div style={s.avatar}>
              {user.avatar_url
                ? <img src={user.avatar_url} alt="avatar" style={s.avatarImg} />
                : initials.toUpperCase()
              }
            </div>
            <SuccessOverlay show={showSuccess} style={{ position: 'absolute', bottom: '-6px', right: '-6px' }} />
          </div>
          <div style={s.heroInfo}>
            <div style={s.heroName}>{user.first_name || 'User'} {user.last_name || ''}</div>
            <div style={s.heroEmail}>{user.email}</div>
            <div style={s.planBadge}><I.Star width={10} height={10} /> Premium Plan</div>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', color: '#6B7280', padding: '7px 10px', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', fontWeight: '600' }}
          >
            <I.Camera width={13} height={13} />{DE(lang) ? 'Foto' : 'Фото'}
          </button>
        </div>
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handleAvatarChange} />
      </div>

      {/* ── Статистика ── */}
      {stats && (
        <div style={s.statsGrid} className="profile-stats-3">
          {[
            { Icon: I.File,     bg: 'rgba(0,229,255,0.1)',  color: '#00E5FF', val: stats.documents,    label: DE(lang) ? 'Dokumente'     : 'Документов' },
            { Icon: I.Card,     bg: 'rgba(104,211,145,0.1)', color: '#68D391', val: stats.transactions, label: DE(lang) ? 'Transaktionen' : 'Транзакций' },
            { Icon: I.Calendar, bg: 'rgba(167,139,250,0.1)', color: '#A78BFA', val: memberSince,        label: DE(lang) ? 'Mitglied seit' : 'С нами с' },
          ].map(({ Icon, bg, color, val, label }) => (
            <div key={label} style={s.statCard}>
              <div style={{ ...s.statIcon, background: bg, color }}><Icon width={14} height={14} /></div>
              <div style={{ ...s.statValue, fontSize: String(val).length > 4 ? '0.88rem' : '1.2rem' }}>{val}</div>
              <div style={s.statLabel}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Личные данные ── */}
      <div style={s.section}>
        <div style={s.sectionHeader}>
          <div style={{ ...s.sectionIcon, background: 'rgba(0,229,255,0.08)', color: '#00E5FF' }}><I.User width={15} height={15} /></div>
          <div style={s.sectionTitle}>{DE(lang) ? 'Persönliche Daten' : 'Личные данные'}</div>
        </div>
        <div style={s.sectionBody}>
          <div className="profile-form-grid">
            <Field label={t.name}    value={user.first_name} onChange={v => setUser(p => ({ ...p, first_name: v }))} />
            <Field label={t.surname} value={user.last_name}  onChange={v => setUser(p => ({ ...p, last_name: v }))} />
            <Field label="Email"     value={user.email}      disabled />
            <Field label={DE(lang) ? 'Telefon' : 'Телефон'} value={user.phone} onChange={v => setUser(p => ({ ...p, phone: v }))} />
          </div>
        </div>
      </div>

      {/* ── Компания ── */}
      <div style={s.section}>
        <div style={s.sectionHeader}>
          <div style={{ ...s.sectionIcon, background: 'rgba(246,173,85,0.1)', color: '#F6AD55' }}><I.Building width={15} height={15} /></div>
          <div style={s.sectionTitle}>{t.biz}</div>
        </div>
        <div style={s.sectionBody}>
          <div className="profile-form-grid">
            <Field label={t.company}  value={user.company?.name}     onChange={v => setUser(p => ({ ...p, company: { ...p.company, name: v } }))} />
            <Field label={t.position} value={user.company?.position} onChange={v => setUser(p => ({ ...p, company: { ...p.company, position: v } }))} />
          </div>
          <div className="profile-form-grid" style={{ marginTop: '10px' }}>
            <Field label={t.tax_id} value={user.company?.tax_id} onChange={v => setUser(p => ({ ...p, company: { ...p.company, tax_id: v } }))} />
            <Field label="IBAN"     value={user.company?.iban}   onChange={v => setUser(p => ({ ...p, company: { ...p.company, iban: v } }))} />
          </div>
          <button onClick={handleSaveProfile} disabled={savingProfile} style={s.saveBtn}>
            {savingProfile ? '...' : t.save}
          </button>
        </div>
      </div>

      {/* ── Смена пароля ── */}
      <div style={s.section}>
        <div style={s.sectionHeader}>
          <div style={{ ...s.sectionIcon, background: 'rgba(252,129,129,0.08)', color: '#FC8181' }}><I.Lock width={15} height={15} /></div>
          <div style={s.sectionTitle}>{DE(lang) ? 'Passwort ändern' : 'Смена пароля'}</div>
        </div>
        <div style={s.sectionBody}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <Field label={DE(lang) ? 'Aktuelles Passwort'   : 'Текущий пароль'}  value={pwCurrent} onChange={v => { setPwCurrent(v); setPwError(''); }} type="password" />
            <Field label={DE(lang) ? 'Neues Passwort'       : 'Новый пароль'}    value={pwNew}     onChange={v => { setPwNew(v);     setPwError(''); }} type="password" />
            <Field label={DE(lang) ? 'Passwort bestätigen'  : 'Повторите пароль'} value={pwConfirm} onChange={v => { setPwConfirm(v); setPwError(''); }} type="password" />
          </div>
          {pwError && <div style={{ color: '#FC8181', fontSize: '0.78rem', marginTop: '8px' }}>{pwError}</div>}
          {pwOk    && <div style={{ color: '#68D391', fontSize: '0.78rem', marginTop: '8px' }}>✓ {DE(lang) ? 'Passwort geändert' : 'Пароль изменён'}</div>}
          <button onClick={handlePasswordSave} disabled={!pwReady} style={s.pwBtn(!!pwReady)}>
            {pwSaving ? '...' : (DE(lang) ? 'Passwort speichern' : 'Сохранить пароль')}
          </button>
        </div>
      </div>

    </div>
  );
}
