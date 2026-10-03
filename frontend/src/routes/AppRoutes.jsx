import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AdminLayout from '../components/layout/AdminLayout';
import ProtectedRoute from './ProtectedRoute';
import Login from '../pages/Login';
import NotFound from '../pages/NotFound';
import Dashboard from '../pages/admin/Dashboard';
import RepairDashboard from '../pages/admin/RepairDashboard';
import UserManager from '../pages/admin/UserManager';
import BranchManager from '../pages/admin/BranchManager';
import CouponManager from '../pages/admin/CouponManager';
import Settings from '../pages/admin/Settings';
import { catalogRoutes } from './catalogRoutes';
import { opsRoutes } from './opsRoutes';

// Admin-only app: everything lives under /admin behind a staff login.
export const AppRoutes = () => (
  <Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/" element={<Navigate to="/admin" replace />} />

    <Route element={<ProtectedRoute />}>
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Dashboard />} />
        {catalogRoutes.map((r) => <Route key={r.path} path={r.path} element={r.element} />)}
        {opsRoutes.map((r) => <Route key={r.path} path={r.path} element={r.element} />)}
        <Route path="repairs" element={<RepairDashboard />} />
        <Route path="customers" element={<UserManager />} />
        <Route path="branches" element={<BranchManager />} />
        <Route path="coupons" element={<CouponManager />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Route>

    <Route path="*" element={<Navigate to="/admin" replace />} />
  </Routes>
);

export default AppRoutes;
