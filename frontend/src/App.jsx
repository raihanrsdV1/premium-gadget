import React, { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import AppRoutes from './routes/AppRoutes';
import { ToastProvider } from './components/admin/Toast';
import { ConfirmProvider } from './components/admin/Modal';
import { useGetProfileQuery } from './store/api/authApi';
import { logout, setUser } from './store/slices/authSlice';

const STAFF = ['super_admin', 'branch_admin'];

/**
 * Re-checks the stored session against the API on start-up: a revoked or
 * expired token signs out (via the 401 handler in apiSlice), and role/branch
 * changes made by a super admin take effect without a re-login.
 */
const SessionSync = () => {
  const dispatch = useDispatch();
  const token = useSelector((s) => s.auth.token);
  const { data } = useGetProfileQuery(undefined, { skip: !token, refetchOnFocus: true });
  useEffect(() => {
    if (!data) return;
    if (!STAFF.includes(data.role)) dispatch(logout());
    else dispatch(setUser(data));
  }, [data, dispatch]);
  return null;
};

function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <BrowserRouter>
          <SessionSync />
          <AppRoutes />
        </BrowserRouter>
      </ConfirmProvider>
    </ToastProvider>
  );
}

export default App;
