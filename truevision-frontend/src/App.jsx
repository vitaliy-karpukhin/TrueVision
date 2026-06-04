import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { LangProvider } from './context/LangContext';
import MainLayout from './layouts/MainLayout';
import ProtectedRoute from './components/ProtectedRoute';
import api, { startKeepAlive } from './api/client';

// Импорт страниц
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Profile from './pages/Profile';
import PathSelection from './pages/PathSelection';
import Onboarding from './pages/Onboarding';
import Analytics from './pages/Analytics';
import Finances from './pages/Finances';
import AIChat from './pages/AIChat';
import Calendar from './pages/Calendar';
import Documents from './pages/Documents';
import Transactions from './pages/Transactions';
import VerifyEmail from './pages/VerifyEmail';

// 1. Проверка живой сессии (если удалили юзера из БД)
const AuthWatcher = ({ children }) => {
  useEffect(() => {
    const checkUserInDB = async () => {
      const token = localStorage.getItem('token');
      if (!token) return;

      try {
        await api.get('/auth/me');
        startKeepAlive();
      } catch (err) {
        if (err.response?.status === 401 || err.response?.status === 404) {
          localStorage.clear();
          window.location.href = '/login';
        }
      }
    };
    checkUserInDB();
  }, []);

  return children;
};

// 2. Умный редирект для страницы логина
const PublicRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  const userPath = localStorage.getItem('user_path');
  const isOnboarded = localStorage.getItem('is_onboarded') === 'true';

  if (token) {
    if (!userPath) return <Navigate to="/path-selection" replace />;
    if (!isOnboarded) return <Navigate to="/onboarding" replace />;
    return <Navigate to="/dashboard" replace />;
  }
  return children;
};

// 3. Компонент для защиты основной части приложения
const DashboardGuard = ({ children }) => {
  const userPath = localStorage.getItem('user_path');
  const isOnboarded = localStorage.getItem('is_onboarded') === 'true';

  if (!userPath) return <Navigate to="/path-selection" replace />;
  if (!isOnboarded) return <Navigate to="/onboarding" replace />;

  return children;
};

export default function App() {
  return (
    <LangProvider>
      <BrowserRouter>
        <AuthWatcher>
          <Routes>
            {/* ВЕРИФИКАЦИЯ EMAIL */}
            <Route path="/verify-email" element={<VerifyEmail />} />

            {/* ЛОГИН */}
            <Route path="/login" element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            } />

            {/* ВЫБОР ПУТИ */}
            <Route path="/path-selection" element={
              <ProtectedRoute requirePath={false}>
                <PathSelection />
              </ProtectedRoute>
            } />

            {/* ОНБОРДИНГ */}
            <Route path="/onboarding" element={
              <ProtectedRoute requirePath={true}>
                <Onboarding />
              </ProtectedRoute>
            } />

            {/* ГЛАВНОЕ ПРИЛОЖЕНИЕ (LAYOUT) */}
            <Route path="/" element={
              <ProtectedRoute requirePath={true}>
                <DashboardGuard>
                  <MainLayout />
                </DashboardGuard>
              </ProtectedRoute>
            }>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="/ai-chat" element={<AIChat />} />
              <Route path="finances" element={<Finances />} />
              <Route path="income" element={<Navigate to="/finances" replace />} />
              <Route path="expenses" element={<Navigate to="/finances" replace />} />
              <Route path="transactions" element={<Transactions />} />
              <Route path="documents" element={<Documents />} />
              <Route path="/calendar" element={<Calendar />} />
              <Route path="profile" element={<Profile />} />
            </Route>

            {/* ВЕРНЫЙ РЕДИРЕКТ ДЛЯ ВСЕГО ОСТАЛЬНОГО */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </AuthWatcher>
      </BrowserRouter>
    </LangProvider>
  );
}