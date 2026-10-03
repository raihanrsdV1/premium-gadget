import React from 'react';
import OrdersPage from '../pages/admin/ops/orders/OrdersPage';
import OrderDetailPage from '../pages/admin/ops/orders/OrderDetailPage';
import InventoryPage from '../pages/admin/ops/inventory/InventoryPage';
import PosPage from '../pages/admin/ops/pos/PosPage';
import SalesHistoryPage from '../pages/admin/ops/pos/SalesHistoryPage';
import SaleDetailPage from '../pages/admin/ops/pos/SaleDetailPage';

// Operations screens (owned by the operations workstream): orders,
// inventory, POS. Paths are relative to /admin.
export const opsRoutes = [
  { path: 'orders', element: <OrdersPage /> },
  { path: 'orders/:id', element: <OrderDetailPage /> },
  { path: 'inventory', element: <InventoryPage /> },
  { path: 'pos', element: <PosPage /> },
  { path: 'pos/sales', element: <SalesHistoryPage /> },
  { path: 'pos/sales/:id', element: <SaleDetailPage /> },
];
