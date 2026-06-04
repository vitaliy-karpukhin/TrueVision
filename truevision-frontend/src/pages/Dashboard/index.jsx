import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { s } from './styles';
import { StatCard, NotificationItem } from './components';
import Skeleton, { SkeletonCard } from '../../components/Skeleton.jsx';
import api, { cachedGet } from '../../api/client';
import { useExport } from '../../hooks/useExport';
import { ActionIcons } from '../../components/Icons.jsx';
import { useT } from '../../locales/i18n.js';

const BAR_COLORS = ['#4FD1C5', '#F687B3', '#3182CE', '#68D391', '#F6AD55', '#90CDF4', '#B794F4'];

const periodSelectorStyle = {
  display: 'flex', gap: '8px', marginBottom: '1.5rem', alignItems: 'center',
};

const pillStyle = (active) => ({
  padding: '6px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer',
  fontSize: '0.78rem', fontWeight: '600',
  background: active ? '#00E5FF' : '#1E2530',
  color: active ? '#0B0F17' : '#6B7280', transition: 'all 0.2s',
});

function fmt(val) {
  const n = Number(val) || 0;
  return `${n.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €`;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const t = useT();
  const { download, loading: exportLoading } = useExport();
  const [period,    setPeriod]   = useState('month');
  const [metrics,   setMetrics]  = useState({ income: 0, expenses: 0, business_score: 0, documents_analyzed: 0 });
  const [chartData, setChartData] = useState([]);
  const [forecast,  setForecast] = useState(null);
  const [loading,   setLoading]  = useState(true);

  const PERIOD_LABELS = { week: t.week, month: t.month, year: t.year };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      cachedGet(`/dashboard?period=${period}`),
      cachedGet('/dashboard/chart-data?period=week'),
      cachedGet('/dashboard/forecast'),
    ])
      .then(([metricsData, chartData, forecastData]) => {
        if (cancelled) return;
        setMetrics(metricsData);
        setChartData(chartData);
        setForecast(forecastData);
      })
      .catch((err) => console.error('Dashboard fetch error:', err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [period]);

  const savingsRate = metrics.income > 0
    ? Math.round(((metrics.income - metrics.expenses) / metrics.income) * 100)
    : 0;
  const available = metrics.income - metrics.expenses;

  const barData = chartData.map((item, idx) => ({
    name: item.name, value: item.income, color: BAR_COLORS[idx % BAR_COLORS.length],
  }));
  const hasChartData = barData.some(d => d.value > 0);

  return (
    <main style={s.main}>
      <div className="period-row">
        {Object.entries(PERIOD_LABELS).map(([key, label]) => (
          <button key={key} style={pillStyle(period === key)} onClick={() => setPeriod(key)}>
            {label}
          </button>
        ))}
        <div className="period-actions">
          <button
            onClick={() => navigate('/documents')}
            style={{ padding: '6px 14px', borderRadius: '10px', border: '1px solid #1E2530', background: 'transparent', color: '#9CA3AF', fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <ActionIcons.File size={13} />
            {t.documents}
          </button>
          <button
            onClick={() => download({ period, type: 'all' })}
            disabled={exportLoading}
            style={{ padding: '6px 14px', borderRadius: '10px', border: '1px solid #1E2530', background: 'transparent', color: exportLoading ? '#4A5568' : '#9CA3AF', fontSize: '0.78rem', fontWeight: '600', cursor: exportLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <ActionIcons.Download />
            {exportLoading ? t.exporting : t.csv}
          </button>
        </div>
      </div>

      {/* ── Онбординг ── */}
      {!loading && metrics.documents_analyzed === 0 && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(0,229,255,0.05), rgba(124,58,237,0.05))',
          border: '1px solid rgba(0,229,255,0.15)',
          borderRadius: '20px', padding: '1.5rem', marginBottom: '1.5rem',
        }}>
          <div style={{ color: '#00E5FF', fontWeight: '800', fontSize: '1rem', marginBottom: '4px' }}>
            👋 Добро пожаловать в TrueVision
          </div>
          <div style={{ color: '#6B7280', fontSize: '0.8rem', marginBottom: '1.25rem' }}>
            Начни за 3 шага, чтобы увидеть твою финансовую картину
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
            {[
              { step: '1', icon: '📄', title: 'Загрузи документ', desc: 'PDF счёта, выписки или отчёта', btn: 'Открыть документы', action: () => navigate('/documents') },
              { step: '2', icon: '🤖', title: 'Проанализируй', desc: 'AI извлечёт суммы и транзакции', btn: null },
              { step: '3', icon: '📊', title: 'Смотри статистику', desc: 'Графики и бюджет появятся здесь', btn: null },
            ].map(({ step, icon, title, desc, btn, action }) => (
              <div key={step} style={{
                background: 'rgba(255,255,255,0.03)', borderRadius: '14px',
                padding: '1rem', border: '1px solid rgba(255,255,255,0.05)',
                display: 'flex', flexDirection: 'column', gap: '4px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '1.1rem' }}>{icon}</span>
                  <span style={{ color: '#00E5FF', fontSize: '0.65rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Шаг {step}</span>
                </div>
                <div style={{ color: '#E2E8F0', fontSize: '0.85rem', fontWeight: '700' }}>{title}</div>
                <div style={{ color: '#4A5568', fontSize: '0.75rem', flex: 1 }}>{desc}</div>
                {btn && (
                  <button onClick={action} style={{
                    marginTop: '10px', background: '#00E5FF', border: 'none',
                    borderRadius: '8px', color: '#0B0F17', fontSize: '0.75rem',
                    fontWeight: '700', padding: '7px 14px', cursor: 'pointer', alignSelf: 'flex-start',
                  }}>{btn}</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="stats-grid" style={{ marginBottom: '1.25rem' }}>
        {loading ? Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i}>
            <Skeleton width="50%" height="12px" style={{ marginBottom: '14px' }} />
            <Skeleton width="70%" height="28px" radius="6px" />
          </SkeletonCard>
        )) : (
          <>
            <StatCard title={t.income}           value={fmt(metrics.income)}   change={`${metrics.documents_analyzed} doc`} trend="up"   onClick={() => navigate('/transactions?category=income')} />
            <StatCard title={t.expenses}          value={fmt(metrics.expenses)} change="" trend="down" onClick={() => navigate('/transactions?category=expense')} />
            <StatCard title={t.dash_savingsRate}  value={`${savingsRate}%`}     onClick={() => navigate('/analytics')} />
            <StatCard title={t.dash_available}    value={fmt(available)}        onClick={() => navigate('/finances')} />
          </>
        )}
      </div>

      {forecast && forecast.count === 0 && metrics.documents_analyzed > 0 && (
        <div style={{ background: '#151B28', border: '1px solid #1E2530', borderRadius: '14px', padding: '0.75rem 1.1rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '1rem' }}>📅</span>
          <span style={{ color: '#6B7280', fontSize: '0.8rem' }}>
            {t.dash_hintText}{' '}
            <a href="/transactions" style={{ color: '#00E5FF', textDecoration: 'none', fontWeight: '600' }}>{t.dash_hintLink}</a>
            {' '}{t.dash_hintSuffix}
          </span>
        </div>
      )}

      {forecast && forecast.count > 0 && (
        <div style={{ background: 'linear-gradient(135deg, rgba(0,229,255,0.06) 0%, rgba(59,130,246,0.06) 100%)', border: '1px solid rgba(0,229,255,0.15)', borderRadius: '16px', padding: '1rem 1.25rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
          <div>
            <div style={{ color: '#00E5FF', fontSize: '0.7rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
              {t.dash_forecastTitle}
            </div>
            <div style={{ color: '#6B7280', fontSize: '0.75rem' }}>
              {t.dash_forecastCount(forecast.count)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
            {[
              { label: t.income,           val: forecast.income,  sign: '+',                            color: '#68D391' },
              { label: t.expenses,         val: forecast.expense, sign: '−',                            color: '#FC8181' },
              { label: t.dash_forecastNet, val: forecast.net,     sign: forecast.net >= 0 ? '+' : '−', color: forecast.net >= 0 ? '#00E5FF' : '#FC8181' },
            ].map(({ label, val, sign, color }) => (
              <div key={label}>
                <div style={{ color: '#6B7280', fontSize: '0.7rem', marginBottom: '2px' }}>{label}</div>
                <div style={{ color, fontWeight: '700', fontSize: '1rem' }}>
                  {sign}{Math.abs(val).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="two-col-grid" style={{ flex: 1, minHeight: 0 }}>
        <div style={s.card}>
          <h3 style={{ color: 'white', marginBottom: '2rem' }}>{t.dash_chartTitle}</h3>
          <div style={{ flex: 1, width: '100%', minHeight: 0 }}>
            {!hasChartData ? (
              <div style={{ color: '#4A5568', textAlign: 'center', paddingTop: '4rem', fontSize: '0.85rem' }}>
                {t.dash_chartNoData}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1E2530" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#4A5568', fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ background: '#151B28', border: '1px solid #1E2530', borderRadius: '12px', color: '#fff' }}
                    formatter={(val) => [`${val} €`, t.dash_chartIncome]}
                  />
                  <Bar dataKey="value" radius={[10, 10, 10, 10]} barSize={45}>
                    {barData.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div style={s.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
            <h3 style={{ color: 'white', margin: 0 }}>{t.dash_notifications}</h3>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {available < 0 && (
              <NotificationItem type="error"   title={t.dash_overBudgetTitle} text={t.dash_overBudgetText(fmt(Math.abs(available)))} time={t.now} />
            )}
            {available >= 0 && metrics.income > 0 && (
              <NotificationItem type="success" title={t.dash_okTitle}         text={t.dash_okText(fmt(available))}                   time={t.now} />
            )}
            {savingsRate > 0 && (
              <NotificationItem type="success" title={`${t.dash_savingsRate}: ${savingsRate}%`} text={t.dash_savingsOk} time="" />
            )}
            {metrics.documents_analyzed === 0 && (
              <NotificationItem type="warning" title={t.dash_noDocsTitle} text={t.dash_noDocsText} time="" />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
