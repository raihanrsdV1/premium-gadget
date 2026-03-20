import React from 'react';
import { Routes, Route } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import AdminLayout from '../components/layout/AdminLayout';
import Dashboard from '../pages/admin/Dashboard';
import ProductManager from '../pages/admin/ProductManager';
import OrderManager from '../pages/admin/OrderManager';
import RepairDashboard from '../pages/admin/RepairDashboard';
import UserManager from '../pages/admin/UserManager';
import InventoryManager from '../pages/admin/InventoryManager';
import BranchManager from '../pages/admin/BranchManager';
import CouponManager from '../pages/admin/CouponManager';
import POSTerminal from '../pages/admin/POSTerminal';

export const AdminRoutes = () => {
  return (
    <Routes>
      <Route element={<ProtectedRoute allowedRoles={['super_admin', 'branch_admin']} />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="products" element={<ProductManager />} />
          <Route path="orders" element={<OrderManager />} />
          <Route path="repairs" element={<RepairDashboard />} />
          <Route path="customers" element={<UserManager />} />
          <Route path="inventory" element={<InventoryManager />} />
          <Route path="branches" element={<BranchManager />} />
          <Route path="coupons" element={<CouponManager />} />
          <Route path="pos" element={<POSTerminal />} />
          <Route path="*" element={<div className="text-muted-foreground text-sm">Module not found.</div>} />
        </Route>
      </Route>
    </Routes>
  );
};

export default AdminRoutes;
