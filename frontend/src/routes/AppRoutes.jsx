import React from 'react';
import { Routes, Route } from 'react-router-dom';
import MainLayout from '../components/layout/MainLayout';
import AdminLayout from '../components/layout/AdminLayout';
import Home from '../pages/Home';
import Login from '../pages/Login';
import Register from '../pages/Register';
import ProductList from '../pages/ProductList';
import ProductDetail from '../pages/ProductDetail';
import CartPage from '../pages/CartPage';
import CheckoutPage from '../pages/CheckoutPage';
import RepairServices from '../pages/RepairServices';
import RepairTracking from '../pages/RepairTracking';
import Wishlist from '../pages/Wishlist';
import OrderHistory from '../pages/OrderHistory';
import OrderSuccess from '../pages/OrderSuccess';
import SearchPage from '../pages/SearchPage';
import NotFound from '../pages/NotFound';
import ProtectedRoute from './ProtectedRoute';

// Admin pages
import Dashboard from '../pages/admin/Dashboard';
import ProductManager from '../pages/admin/ProductManager';
import OrderManager from '../pages/admin/OrderManager';
import RepairDashboard from '../pages/admin/RepairDashboard';
import UserManager from '../pages/admin/UserManager';
import InventoryManager from '../pages/admin/InventoryManager';
import BranchManager from '../pages/admin/BranchManager';
import CouponManager from '../pages/admin/CouponManager';
import POSTerminal from '../pages/admin/POSTerminal';

export const AppRoutes = () => {
  return (
    <Routes>
      {/* ── Admin routes (no MainLayout, no header/footer) ── */}
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
        </Route>
      </Route>

      {/* ── Public / customer routes (wrapped in MainLayout) ── */}
      <Route path="/" element={<MainLayout />}>
        <Route index element={<Home />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="products" element={<ProductList />} />
        <Route path="products/:slug" element={<ProductDetail />} />
        <Route path="cart" element={<CartPage />} />
        <Route path="repairs" element={<RepairServices />} />
        <Route path="repairs/track" element={<RepairTracking />} />
        <Route path="search" element={<SearchPage />} />

        {/* Protected customer routes */}
        <Route element={<ProtectedRoute allowedRoles={['customer', 'branch_admin', 'super_admin']} />}>
          <Route path="checkout" element={<CheckoutPage />} />
          <Route path="wishlist" element={<Wishlist />} />
          <Route path="orders" element={<OrderHistory />} />
          <Route path="order-success" element={<OrderSuccess />} />
        </Route>

        {/* Unauthorized */}
        <Route path="unauthorized" element={
          <div className="container flex flex-col items-center justify-center min-h-[70vh] text-center">
            <h1 className="text-6xl font-bold text-destructive mb-4">403</h1>
            <h2 className="text-2xl font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground mb-8">You don't have permission to view this page.</p>
            <a href="/" className="bg-primary text-primary-foreground px-6 py-2 rounded-md font-medium">Return Home</a>
          </div>
        } />

        {/* 404 — must be last */}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
};

export default AppRoutes;
