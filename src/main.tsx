
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
import Bookings from './pages/Classes/Bookings';
import Plans from './pages/Memberships/Plans';
import Categories from './pages/CategoriesPage';
import ThemeSettings from './pages/ThemeSettingsPage';
import Coaches from './pages/CoachesPage';
import GymInfo from './pages/GymInfoPage';
import BulkBookings from './pages/Classes/AdminBulkBookingsPage';


//test program
import ProgramsPage2 from './pages/Classes/ProgramsPage2';

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
      { path: 'categories', element: <Categories /> },
      { path: 'sessions', element: <ClassSessionsPage /> },
      { path: 'programs', element: <ProgramsPage2 /> },
      { path: 'bookings', element: <Bookings /> },
      { path: 'plans', element: <Plans /> },
      { path: 'memberships', element: <Memberships /> },
      { path: 'themesettings', element: <ThemeSettings /> },
      { path: 'coaches', element: <Coaches /> },
      { path: 'gyminfo', element: <GymInfo /> },
      { path: 'bulkbookings', element: <BulkBookings /> },
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

