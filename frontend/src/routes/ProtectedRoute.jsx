import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';

/**
 * Client-side gate for staff screens. The API enforces roles on every
 * request; this only keeps customers and signed-out users out of the UI.
 */
export const ProtectedRoute = ({ allowedRoles = ['super_admin', 'branch_admin'] }) => {
  const { isAuthenticated, user } = useSelector((state) => state.auth);
  const location = useLocation();

  if (!isAuthenticated || !allowedRoles.includes(user?.role)) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
};

export default ProtectedRoute;
