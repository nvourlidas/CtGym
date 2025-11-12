// src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import './index.css';
import { AuthProvider } from './auth/AuthProvider';
import AdminRoute from './auth/AdminRoute';
import AppShell from './layout/AppShell';

import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import Members from './pages/Members';
import Memberships from './pages/Memberships/MembershipsPage';
import Classes from './pages/Classes/Classes';
import ClassSessionsPage from './pages/Classes/ClassSessions';
import Programs from './pages/Classes/ProgramsPage';
import Bookings from './pages/Classes/Bookings';
import Plans from './pages/Memberships/Plans';

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: (
      <AdminRoute>
        <AppShell />
      </AdminRoute>
    ),
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'members', element: <Members /> },
      { path: 'classes', element: <Classes /> },
      { path: 'sessions', element: <ClassSessionsPage /> },
      { path: 'programs', element: <Programs /> },
      { path: 'bookings', element: <Bookings /> },
      { path: 'plans', element: <Plans /> },
      { path: 'memberships', element: <Memberships /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </React.StrictMode>
);

