import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import api from '../../api/client';
import { useT } from '../../locales/i18n.js';
import { useLang } from '../../context/LangContext.jsx';

function ConfirmModal({ message, onConfirm, onCancel }) {
  return ReactDOM.createPortal(
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}
      onMouseDown={onCancel}
    >
      <div
        style={{ background: '#151B28', border: '1px solid #2D3748', borderRadius: '16px', padding: '1.5rem 1.75rem', width: '100%', maxWidth: '360px', boxShadow: '0 16px 48px rgba(0,0,0,0.6)' }}
        onMouseDown={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '0.75rem' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0, background: 'rgba(252,129,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FC8181" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
          </div>
          <h3 style={{ margin: 0, color: '#E2E8F0', fontSize: '0.95rem', fontWeight: '700' }}>Удалить?</h3>
        </div>
        <p style={{ margin: '0 0 1.25rem', color: '#6B7280', fontSize: '0.82rem', lineHeight: '1.5' }}>{message}</p>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={onCancel} style={{ flex: 1, padding: '9px', background: 'transparent', border: '1px solid #2D3748', borderRadius: '10px', color: '#6B7280', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer' }}>
            Отмена
          </button>
          <button onClick={onConfirm} style={{ flex: 1, padding: '9px', background: '#FC8181', border: 'none', borderRadius: '10px', color: '#0B0F17', fontSize: '0.85rem', fontWeight: '700', cursor: 'pointer' }}>
            Удалить
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

const COLORS = ['#4FD1C5', '#68D391', '#F6AD55', '#B794F4', '#60A5FA', '#F472B6'];

// Заменяет лейблы дефолтных категорий/статей на текущий язык.
// Пользовательские категории (id не в дефолтах) остаются нетронутыми.
function localizeBudget(budget, t) {
  const catMap = {};
  t.bud_defaultCategories.forEach(cat => {
    catMap[cat.id] = { label: cat.label, items: {} };
    cat.items.forEach(item => { catMap[cat.id].items[item.id] = item.label; });
  });
  return {
    ...budget,
    categories: budget.categories.map(cat => {
      const def = catMap[cat.id];
      if (!def) return cat;
      return {
        ...cat,
        label: def.label,
        items: cat.items.map(item => {
          const defLabel = def.items[item.id];
          return defLabel ? { ...item, label: defLabel } : item;
        }),
      };
    }),
  };
}

function fmt(n) {
  return Number(n || 0).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function CategoryCard({ cat, index, onChange, onDelete, onAddItem, onDeleteItem, t, actual }) {
  const color   = cat.color || COLORS[index % COLORS.length];
  const planned = cat.items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const spent   = actual || 0;
  const pct     = planned > 0 ? Math.min((spent / planned) * 100, 100) : 0;
  const diff    = planned - spent;
  const barColor = pct >= 100 ? '#E53E3E' : pct >= 85 ? '#FC8181' : pct >= 65 ? '#F6AD55' : '#68D391';
  const total = planned;

  return (
    <div style={{
      background: '#151B28',
      borderRadius: '20px',
      border: '1px solid #1E2530',
      borderTop: `3px solid ${color}`,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Заголовок категории */}
      <div style={{
        padding: '1rem 1.2rem 0.75rem',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        borderBottom: '1px solid #1E2530',
        flexShrink: 0,
      }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <input
          value={cat.label}
          onChange={e => onChange({ ...cat, label: e.target.value })}
          style={{
            flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none',
            color: '#fff', fontSize: '0.95rem', fontWeight: '700',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
          placeholder={t.bud_catPlaceholder}
        />
        <span style={{ color, fontWeight: '800', fontSize: '0.95rem', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {fmt(total)} €
        </span>
        <button
          onClick={onDelete}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#374151', fontSize: '1rem', lineHeight: 1, padding: '2px 4px', transition: 'color 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.color = '#FC8181'}
          onMouseLeave={e => e.currentTarget.style.color = '#374151'}
          title="Удалить категорию"
        >×</button>
      </div>

      {/* Прогресс-бар план vs факт */}
      {spent > 0 && planned > 0 && (
        <div style={{ padding: '0.6rem 1.2rem 0', borderBottom: '1px solid #1E2530' }}>
          {/* Цифры */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.72rem', color: '#6B7280' }}>
              {t.bud_spent}: <span style={{ color: barColor, fontWeight: '700' }}>{fmt(spent)} €</span>
            </span>
            <span style={{ fontSize: '0.72rem', color: diff >= 0 ? '#68D391' : '#FC8181', fontWeight: '700' }}>
              {diff >= 0 ? `${t.bud_left}: ${fmt(diff)} €` : `${t.bud_over}: ${fmt(Math.abs(diff))} €`}
            </span>
          </div>
          {/* Трек */}
          <div style={{ height: '4px', background: '#1E2530', borderRadius: '4px', overflow: 'hidden', marginBottom: '0.6rem' }}>
            <div style={{
              height: '100%',
              width: `${pct}%`,
              background: barColor,
              borderRadius: '4px',
              transition: 'width 0.5s ease',
            }} />
          </div>
        </div>
      )}

      {/* Список статей */}
      <div style={{ padding: '0.5rem 1.2rem' }}>
        {cat.items.map((item) => (
          <div key={item.id} style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '7px 0',
            borderBottom: '1px solid rgba(255,255,255,0.03)',
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: `${color}66`, flexShrink: 0 }} />
            <input
              value={item.label}
              onChange={e => onChange({
                ...cat,
                items: cat.items.map(i => i.id === item.id ? { ...i, label: e.target.value } : i),
              })}
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#CBD5E0', fontSize: '0.85rem' }}
              placeholder={t.bud_itemPlaceholder}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
              <input
                type="number"
                min="0"
                value={item.amount || ''}
                onChange={e => onChange({
                  ...cat,
                  items: cat.items.map(i => i.id === item.id ? { ...i, amount: parseFloat(e.target.value) || 0 } : i),
                })}
                style={{ width: '90px', boxSizing: 'border-box', background: '#0B0F17', border: '1px solid #1E2530', borderRadius: '8px', color: '#fff', fontSize: '0.85rem', fontWeight: '600', padding: '5px 8px', outline: 'none', textAlign: 'right' }}
                placeholder="0"
              />
              <span style={{ color: '#4A5568', fontSize: '0.8rem' }}>€</span>
            </div>
            <button
              onClick={() => onDeleteItem(item.id, item.label)}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#374151', fontSize: '0.9rem', lineHeight: 1, padding: '2px', transition: 'color 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.color = '#FC8181'}
              onMouseLeave={e => e.currentTarget.style.color = '#374151'}
            >×</button>
          </div>
        ))}
      </div>

      {/* Кнопка добавить — прижата к низу */}
      <button
        onClick={onAddItem}
        style={{
          flexShrink: 0,
          margin: '0.5rem 1.2rem 0.9rem',
          background: 'transparent',
          border: `1px dashed ${color}44`,
          borderRadius: '10px',
          color: color,
          fontSize: '0.78rem',
          fontWeight: '600',
          padding: '6px 12px',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        {t.bud_addItem}
      </button>
    </div>
  );
}

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function BudgetPlanner() {
  const t = useT();
  const { lang } = useLang();
  const period = currentPeriod();
  const [budget,  setBudget]  = useState(null);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const rawBudget = useRef(null);
  const saveTimer = useRef(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [actual, setActual] = useState({});
  const [winW, setWinW] = useState(typeof window !== 'undefined' ? window.innerWidth : 1440);
  useEffect(() => {
    const h = () => setWinW(window.innerWidth);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  const fileInputRef = useRef(null);

  const loadBudget = useCallback(() => {
    setBudget(null);
    Promise.all([
      api.get(`/budget?period=${period}`),
      api.get(`/budget/actual?period=${period}`).catch(() => ({ data: {} })),
    ]).then(([budgetRes, actualRes]) => {
      const data  = budgetRes.data;
      const clean = { income: data.income || 0, categories: data.categories || [] };
      rawBudget.current = clean;
      setBudget(localizeBudget(clean, t));
      setActual(actualRes.data || {});
    }).catch(() => {
      const fallback = { income: 0, categories: [] };
      rawBudget.current = fallback;
      setBudget(fallback);
    });
  }, [t]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post('/documents/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      const docId = res.data?.id || res.data?.existing_id;
      if (!docId) { setUploadError('Ошибка загрузки.'); return; }
      await api.post(`/budget/import/${docId}`);
      loadBudget();
    } catch (err) {
      const msg = err?.response?.data?.detail;
      setUploadError(msg || 'Документ не распознан как Haushaltsbudget.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  useEffect(() => { loadBudget(); }, []);

  useEffect(() => {
    if (rawBudget.current) setBudget(prev => prev ? localizeBudget(prev, t) : prev);
  }, [lang]);

  const autosave = useCallback((next) => {
    clearTimeout(saveTimer.current);
    setSaved(false);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        await api.put(`/budget?period=${period}`, next);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } catch (e) { console.error(e); }
      finally { setSaving(false); }
    }, 1200);
  }, [period]);

  const update = useCallback((next) => { setBudget(next); autosave(next); }, [autosave]);
  const updateCategory = (idx, cat) => update({ ...budget, categories: budget.categories.map((c, i) => i === idx ? cat : c) });
  const deleteCategory = (idx) => update({ ...budget, categories: budget.categories.filter((_, i) => i !== idx) });
  const addCategory = () => update({ ...budget, categories: [...budget.categories, { id: uid(), label: t.bud_newCategory, color: COLORS[budget.categories.length % COLORS.length], items: [] }] });

  if (!budget) return <div style={{ color: '#4A5568', textAlign: 'center', paddingTop: '3rem', fontSize: '0.9rem' }}>{t.bud_loading}</div>;

  const hasData = budget.categories?.some(cat => cat.items?.some(i => (i.amount || 0) > 0));
  const totalExpenses = budget.categories.reduce((s, cat) => s + cat.items.reduce((ss, i) => ss + (Number(i.amount) || 0), 0), 0);
  const income = budget.income || 0;
  const surplus = income - totalExpenses;
  const surplusColor = surplus >= 0 ? '#68D391' : '#FC8181';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* ── Строка "доход + сводка" ── */}
      {hasData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Monatliches Einkommen */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#151B28', border: '1px solid #1E2530', borderRadius: '14px', padding: '12px 16px' }}>
            <span style={{ color: '#6B7280', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>{t.bud_monthlyIncome}</span>
            {(saving || saved) && <span style={{ fontSize: '0.72rem', color: saved ? '#68D391' : '#4A5568', flexShrink: 0 }}>{saving ? t.saving : t.saved}</span>}
            <input
              type="number" min="0"
              value={budget.income || ''}
              onChange={e => update({ ...budget, income: parseFloat(e.target.value) || 0 })}
              style={{ flex: 1, minWidth: 0, maxWidth: '160px', marginLeft: 'auto', background: '#0B0F17', border: '1px solid #1E2530', borderRadius: '8px', color: '#fff', fontSize: '0.9rem', fontWeight: '700', padding: '5px 10px', outline: 'none', textAlign: 'right' }}
              placeholder="0"
            />
            <span style={{ color: '#6B7280', fontSize: '0.85rem', flexShrink: 0 }}>€</span>
          </div>
          {/* Ausgaben + Saldo — в одну строку под доходом */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {[{ label: t.bud_expenses, val: totalExpenses, color: '#FC8181' }, { label: t.bud_remainder, val: surplus, color: surplusColor }].map(({ label, val, color }) => (
              <div key={label} style={{ background: '#151B28', border: '1px solid #1E2530', borderRadius: '14px', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ color: '#6B7280', fontSize: '0.7rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
                <span style={{ color, fontWeight: '800', fontSize: '1.15rem', fontVariantNumeric: 'tabular-nums' }}>{val < 0 ? '−' : ''}{fmt(Math.abs(val))} €</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Прогресс-бар — только когда есть данные */}
      {hasData && income > 0 && (
        <div style={{ background: '#151B28', borderRadius: '12px', border: '1px solid #1E2530', padding: '12px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: '#6B7280', fontSize: '0.75rem', fontWeight: '600' }}>{t.bud_used}</span>
            <span style={{ color: surplus >= 0 ? '#68D391' : '#FC8181', fontSize: '0.75rem', fontWeight: '700' }}>
              {Math.min(Math.round((totalExpenses / income) * 100), 999)}%
            </span>
          </div>
          <div style={{ height: '6px', background: '#1E2530', borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min((totalExpenses / income) * 100, 100)}%`, background: surplus >= 0 ? 'linear-gradient(90deg, #4FD1C5, #68D391)' : 'linear-gradient(90deg, #F6AD55, #FC8181)', borderRadius: '10px', transition: 'width 0.4s ease' }} />
          </div>
          <div style={{ display: 'flex', gap: '4px', marginTop: '8px', flexWrap: 'wrap' }}>
            {budget.categories.map((cat, i) => {
              const catTotal = cat.items.reduce((s, item) => s + (Number(item.amount) || 0), 0);
              const pct = income > 0 ? Math.round((catTotal / income) * 100) : 0;
              if (catTotal === 0) return null;
              return (
                <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: cat.color || COLORS[i % COLORS.length] }} />
                  <span style={{ color: '#6B7280', fontSize: '0.7rem' }}>{cat.label}: {pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Пустое состояние — нет данных из документа */}
      {!hasData && (
        <div style={{ background: '#151B28', border: '1px dashed #2D3748', borderRadius: '20px', padding: '3rem 2rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#2D3748" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
          </svg>
          <div style={{ color: '#E2E8F0', fontWeight: '700', fontSize: '1rem' }}>
            Загрузите документ бюджета
          </div>
          <div style={{ color: '#4A5568', fontSize: '0.82rem', maxWidth: '320px', lineHeight: '1.6' }}>
            Загрузите PDF с Haushaltsbudget — категории и суммы появятся автоматически
          </div>
          <input ref={fileInputRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={handleUpload} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{ marginTop: '0.25rem', background: 'rgba(0,229,255,0.1)', border: '1px solid rgba(0,229,255,0.25)', borderRadius: '12px', color: '#00E5FF', fontSize: '0.85rem', fontWeight: '700', padding: '10px 22px', cursor: uploading ? 'default' : 'pointer', opacity: uploading ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            {uploading ? (
              <><span style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid rgba(0,229,255,0.3)', borderTopColor: '#00E5FF', borderRadius: '50%', animation: 'budSpin 0.7s linear infinite' }} />Загрузка...</>
            ) : (
              <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Загрузить документ</>
            )}
          </button>
          {uploadError && <div style={{ color: '#FC8181', fontSize: '0.78rem' }}>{uploadError}</div>}
          <style>{`@keyframes budSpin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Сетка категорий — только когда есть данные */}
      {hasData && (
        <>
          <div style={{
            display: 'grid',
            gridTemplateColumns: winW >= 700 ? 'repeat(2, 1fr)' : '1fr',
            gap: '1rem',
            alignItems: 'stretch',
          }}>
            {budget.categories.map((cat, idx) => (
              <CategoryCard
                key={cat.id}
                cat={cat}
                index={idx}
                t={t}
                actual={actual[cat.id] || 0}
                onChange={(updated) => updateCategory(idx, updated)}
                onDelete={() => setPendingDelete({ type: 'category', idx, label: cat.label })}
                onAddItem={() => updateCategory(idx, { ...cat, items: [...cat.items, { id: uid(), label: '', amount: 0 }] })}
                onDeleteItem={(itemId, itemLabel) => setPendingDelete({ type: 'item', idx, itemId, label: itemLabel })}
              />
            ))}
          </div>
          <button
            onClick={addCategory}
            style={{ background: 'transparent', border: '1px dashed #1E2530', borderRadius: '14px', color: '#4A5568', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '14px', width: '100%', transition: 'border-color 0.2s, color 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#00E5FF44'; e.currentTarget.style.color = '#00E5FF'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#1E2530'; e.currentTarget.style.color = '#4A5568'; }}
          >
            <span style={{ fontSize: '1.2rem' }}>+</span>
            {t.bud_addCategory}
          </button>
        </>
      )}

      {pendingDelete && (
        <ConfirmModal
          message={
            pendingDelete.type === 'category'
              ? `Категория «${pendingDelete.label}» и все её статьи будут удалены навсегда.`
              : `Статья «${pendingDelete.label || 'без названия'}» будет удалена навсегда.`
          }
          onConfirm={() => {
            if (pendingDelete.type === 'category') {
              deleteCategory(pendingDelete.idx);
            } else {
              const cat = budget.categories[pendingDelete.idx];
              updateCategory(pendingDelete.idx, { ...cat, items: cat.items.filter(i => i.id !== pendingDelete.itemId) });
            }
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
