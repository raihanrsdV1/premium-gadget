import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useDispatch } from 'react-redux';
import { setCredentials } from '../store/slices/authSlice';
import { useLoginMutation } from '../store/api/authApi';
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react';

const Login = () => {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [login, { isLoading }] = useLoginMutation();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const result = await login({ phone, password }).unwrap();
      dispatch(setCredentials({ user: result.data.user, token: result.data.token }));
      const role = result.data.user?.role;
      navigate(role === 'super_admin' || role === 'branch_admin' ? '/admin' : '/');
    } catch (err) {
      setError(err.data?.message || 'Invalid phone number or password.');
    }
  };

  return (
    <div className="container relative flex min-h-[80vh] flex-col items-center justify-center md:grid lg:max-w-none lg:grid-cols-2 lg:px-0">
      <Link to="/" className="absolute left-4 top-4 md:left-8 md:top-8 flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors z-20">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back
      </Link>

      <div className="relative hidden h-full flex-col bg-muted p-10 text-white dark:border-r lg:flex overflow-hidden">
        <div className="absolute inset-0 bg-primary/90" />
        <img
          src="https://images.unsplash.com/photo-1593640408182-31c70c8268f5?auto=format&fit=crop&w=1200&q=80"
          alt="Login Background"
          className="absolute inset-0 object-cover opacity-20 w-full h-full"
        />
        <div className="relative z-20 flex items-center text-lg font-medium">
          <span className="font-bold text-2xl tracking-tight">Premium Gadget</span>
        </div>
        <div className="relative z-20 mt-auto">
          <blockquote className="space-y-2">
            <p className="text-lg">
              &ldquo;The best place to buy certified pre-owned tech in Bangladesh. Their repair service is unmatched.&rdquo;
            </p>
            <footer className="text-sm opacity-80">Sofia Davis, Customer since 2024</footer>
          </blockquote>
        </div>
      </div>

      <div className="lg:p-8 w-full max-w-[400px] mx-auto">
        <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
          <div className="flex flex-col space-y-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
            <p className="text-sm text-muted-foreground">Enter your phone and password to sign in</p>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none" htmlFor="phone">Phone Number</label>
              <Input
                id="phone"
                placeholder="017XXXXXXXX"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={isLoading}
                required
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium leading-none" htmlFor="password">Password</label>
                <Link to="/forgot-password" className="text-sm font-medium text-primary hover:underline">Forgot password?</Link>
              </div>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                required
              />
            </div>
            <Button className="w-full" type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign In
            </Button>
          </form>

          <p className="px-8 text-center text-sm text-muted-foreground">
            Don't have an account?{' '}
            <Link to="/register" className="underline underline-offset-4 hover:text-primary">Sign up</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
