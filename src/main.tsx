
// src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import './index.css';
import './styles/datepicker.css';
import { AuthProvider } from './auth/AuthProvider';


import AdminRoute from './auth/AdminRoute';
import AppShell from './layout/AppShell';

import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import Members from './pages/Members/Members';
import MemberDetailsPage from './pages/Members/MemberDetailsPage';
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
import ForgotPassword from './pages/ForgotPasswordPage'
import FinancePage from './pages/FinancePage'
import WorkoutTemplatesPage from './pages/workouts/WorkoutTemplatesPage';
import BillingPage from './pages/BillingPage';
import SessionQrPage from './pages/SessionQrPage';
import QuestionnairesPage from './pages/Questionnaires/QuestionnairesPage';
import QuestionnaireBuilderPage from './pages/Questionnaires/QuestionnaireBuilderPage';

//test program
import ProgramsPage2 from './pages/Classes/ProgramsPage2';
import ResetPasswordPage from './pages/ResetPasswordPage';

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/forgot-password', element: <ForgotPassword /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
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
      { path: '/members/:id', element: <MemberDetailsPage /> },
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
      { path: 'finances', element: <FinancePage /> },
      { path: 'workouttemplates', element: <WorkoutTemplatesPage /> },
      { path: 'billing', element: <BillingPage /> },
      { path: 'qrpage', element: <SessionQrPage /> },
      { path: 'questionnaires', element: <QuestionnairesPage /> },
      { path: '/questionnaires/new', element: <QuestionnaireBuilderPage /> },
      { path: '/questionnaires/:id', element: <QuestionnaireBuilderPage /> },
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

