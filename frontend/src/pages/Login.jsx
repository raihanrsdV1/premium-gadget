import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
import { Loader2, Lock } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Field, TextInput } from '../components/admin/Field';
import { setCredentials } from '../store/slices/authSlice';
import { apiSlice } from '../store/api/apiSlice';
import { useLoginMutation } from '../store/api/authApi';
import { errorText } from '../lib/apiError';
import { BrandLogo } from '../components/admin/BrandLogo';

const STAFF = ['super_admin', 'branch_admin'];

/** Staff sign-in for the shop's admin app. Customers are turned away. */
const Login = () => {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [login, { isLoading }] = useLoginMutation();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const { data } = await login({ phone, password }).unwrap();
      if (!STAFF.includes(data.user.role)) {
        setError('This app is for Premium Gadget staff only.');
        return;
      }
      dispatch(apiSlice.util.resetApiState()); // never show the previous user's cached data
      dispatch(setCredentials(data));
      const from = location.state?.from;
      navigate(from && from.startsWith('/admin') ? from : '/admin', { replace: true });
    } catch (err) {
      setError(errorText(err, 'Could not sign in.'));
    }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-slate-100 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3">
          <BrandLogo size="lg" />
          <span className="text-sm font-medium text-slate-500">Shop management</span>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-xl border bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold">Staff sign in</h1>
          <Field label="Phone number">
            {(id) => <TextInput id={id} type="tel" inputMode="numeric" autoComplete="username" placeholder="01XXXXXXXXX"
              value={phone} onChange={(e) => setPhone(e.target.value)} required autoFocus />}
          </Field>
          <Field label="Password">
            {(id) => <TextInput id={id} type="password" autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)} required />}
          </Field>
          {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign in'}
          </Button>
          <p className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
            <Lock className="h-3.5 w-3.5" /> Forgot your password? Ask the shop owner to reset it.
          </p>
        </form>
      </div>
    </div>
  );
};

export default Login;
