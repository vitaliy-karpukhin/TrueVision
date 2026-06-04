import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import Skeleton from '../../components/Skeleton.jsx';
import { useExport } from '../../hooks/useExport';
import api from '../../api/client';
import { PERIOD_LABELS, INCOME_COLORS, EXPENSE_COLORS, CAT_LABELS, s } from './styles';
import BudgetPlanner from './BudgetPlanner.jsx';
import { useT } from '../../locales/i18n.js';
import './finances.css';

const PERIODS = Object.keys(PERIOD_LABELS);

function fmt(n) {
  return Number(n || 0).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function StatHero({ label, amount, arrow, bg, loading, docsCount, docsLabel }) {
  return (
    <div style={{
      background: bg,
      borderRadius: '20px',
      padding: '1.1rem 1.5rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem',
      position: 'relative',
      overflow: 'hidden',
      flex: 1,
      minWidth: 0,
      boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px' }}>
        <span>{arrow}</span>
        <span>{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
        {loading
          ? <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '2rem' }}>…</span>
          : <>
              <span className="fin-amount" style={{ color: '#fff' }}>{fmt(amount)}</span>
              <span style={{ fontSize: '1rem', fontWeight: '700', color: 'rgba(255,255,255,0.7)' }}>€</span>
            </>
        }
      </div>
      {docsLabel && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.12)', padding: '5px 10px', borderRadius: '8px', alignSelf: 'flex-start', fontSize: '0.78rem', fontWeight: '600', color: '#fff' }}>
          <span>{arrow}</span>
          <span>{docsCount}</span>
          <span style={{ opacity: 0.75 }}>&nbsp;{docsLabel}</span>
        </div>
      )}
    </div>
  );
}

function NetCard({ income, expense, loading }) {
  const net = income - expense;
  const positive = net >= 0;
  const savingsRate = income > 0 ? Math.round((net / income) * 100) : 0;
  return (
    <div style={{
      background: positive ? 'linear-gradient(135deg, #0B3B44 0%, #064E3B 100%)' : 'linear-gradient(135deg, #3B0B0B 0%, #4E0606 100%)',
      borderRadius: '20px',
      padding: '1.1rem 1.5rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem',
      position: 'relative',
      overflow: 'hidden',
      flex: 1,
      minWidth: 0,
      boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
      border: `1px solid ${positive ? 'rgba(0,229,255,0.15)' : 'rgba(252,129,129,0.15)'}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px' }}>
        <span>=</span>
        <span>Баланс</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
        {loading
          ? <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '2rem' }}>…</span>
          : <>
              <span className="fin-amount" style={{ color: positive ? '#00E5FF' : '#FC8181' }}>
                {positive ? '+' : '−'}{fmt(Math.abs(net))}
              </span>
              <span style={{ fontSize: '1.3rem', fontWeight: '700', color: 'rgba(255,255,255,0.5)' }}>€</span>
            </>
        }
      </div>
      {income > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.12)', padding: '5px 10px', borderRadius: '8px', alignSelf: 'flex-start', fontSize: '0.78rem', fontWeight: '600', color: '#fff' }}>
          <span>{savingsRate}%</span>
          <span style={{ opacity: 0.75 }}>сбережений</span>
        </div>
      )}
    </div>
  );
}

function CategoryList({ items, colors, loading, title }) {
  return (
    <div style={{
      background: '#151B28',
      borderRadius: '20px',
      padding: '1.5rem',
      border: '1px solid rgba(255,255,255,0.05)',
      flex: 1,
      minWidth: 0,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
        <span style={{ fontSize: '0.95rem', fontWeight: '700', color: '#fff' }}>{title}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {loading && Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0' }}>
            <Skeleton width="32px" height="32px" radius="8px" style={{ flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <Skeleton width="55%" height="11px" style={{ marginBottom: '6px' }} />
              <Skeleton width="80%" height="4px" radius="4px" />
            </div>
            <Skeleton width="55px" height="11px" />
          </div>
        ))}
        {!loading && items.length === 0 && (
          <div style={{ color: '#4A5568', fontSize: '0.82rem', textAlign: 'center', padding: '1.5rem 0' }}>
            Нет данных — загрузи документы
          </div>
        )}
        {!loading && items.map((item, idx) => {
          const color = colors[idx % colors.length];
          return (
            <div key={idx} style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '10px 12px', borderRadius: '12px',
              background: 'rgba(255,255,255,0.025)',
            }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '8px', flexShrink: 0,
                background: `${color}20`, display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: '0.8rem', fontWeight: '700', color,
              }}>
                {(CAT_LABELS[item.category] || item.category)?.charAt(0)?.toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span style={{ color: '#E2E8F0', fontSize: '0.85rem', fontWeight: '600' }}>
                    {CAT_LABELS[item.category] || item.category}
                  </span>
                  <span style={{ color, fontSize: '0.85rem', fontWeight: '700', whiteSpace: 'nowrap' }}>
                    {fmt(item.amount)} €
                  </span>
                </div>
                <div style={{ height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(item.percentage, 100)}%`, background: color, borderRadius: '4px', transition: 'width 0.4s ease' }} />
                </div>
              </div>
              <span style={{ color: '#6B7280', fontSize: '0.75rem', fontWeight: '600', minWidth: '34px', textAlign: 'right' }}>
                {item.percentage}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Finances() {
  const t = useT();
  const { download, loading: exportLoading } = useExport();
  const [searchParams] = useSearchParams();

  const [tab, setTab] = useState(() => searchParams.get('tab') === 'budget' ? 'budget' : 'overview');
  const [period, setPeriod] = useState('month');
  const [incomeData, setIncomeData] = useState({ total: 0, items: [] });
  const [expenseData, setExpenseData] = useState({ total: 0, items: [] });
  const [docsCount, setDocsCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (tab === 'budget') return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.get(`/dashboard/events/categories?type=income&period=${period}`),
      api.get(`/dashboard/events/categories?type=expense&period=${period}`),
      api.get(`/dashboard?period=${period}`),
    ])
      .then(([incRes, expRes, metricsRes]) => {
        if (cancelled) return;
        setIncomeData(incRes.data);
        setExpenseData(expRes.data);
        setDocsCount(metricsRes.data.documents_analyzed || 0);
      })
      .catch(console.error)
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tab, period]);

  const TABS = [
    { key: 'overview', label: 'Обзор',  color: '#00E5FF' },
    { key: 'budget',   label: t.fin_budget, color: '#00E5FF' },
  ];

  return (
    <div style={s.container}>

      {/* ── Тулбар ── */}
      <div style={s.toolbar}>
        <div style={s.tabGroup}>
          {TABS.map(({ key, label, color }) => (
            <button key={key} style={s.tab(tab === key, color)} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <>
            <div style={s.divider} />
            {Object.entries(PERIOD_LABELS).map(([key, label]) => (
              <button key={key} style={s.pill(period === key)} onClick={() => setPeriod(key)}>
                {label}
              </button>
            ))}
            <button style={s.csvBtn} onClick={() => download({ period, type: 'all' })} disabled={exportLoading}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              {exportLoading ? '...' : 'CSV'}
            </button>
          </>
        )}
      </div>

      {/* ── Бюджет ── */}
      {tab === 'budget' && <BudgetPlanner />}

      {/* ── Обзор ── */}
      {tab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Три hero-карточки */}
          <div className="fin-hero-row">
            <StatHero
              label={t.fin_income}
              amount={incomeData.total}
              arrow="↑"
              bg="linear-gradient(135deg, #064E3B 0%, #065F46 100%)"
              loading={loading}
              docsCount={docsCount}
              docsLabel={t.fin_docsAnalyzed}
            />
            <StatHero
              label={t.fin_expenses}
              amount={expenseData.total}
              arrow="↓"
              bg="linear-gradient(135deg, #7C2D12 0%, #991B1B 100%)"
              loading={loading}
            />
            <NetCard income={incomeData.total} expense={expenseData.total} loading={loading} />
          </div>

          {/* Две колонки категорий */}
          <div className="fin-cat-row">
            <CategoryList
              title={`${t.fin_income} — по категориям`}
              items={incomeData.items}
              colors={INCOME_COLORS}
              loading={loading}
            />
            <CategoryList
              title={`${t.fin_expenses} — по категориям`}
              items={expenseData.items}
              colors={EXPENSE_COLORS}
              loading={loading}
            />
          </div>

        </div>
      )}

    </div>
  );
}
