import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useDispatch } from 'react-redux';
import { setCredentials } from '../store/slices/authSlice';
import { useRegisterMutation } from '../store/api/authApi';
import { ArrowLeft, Loader2, AlertCircle, CheckCircle } from 'lucide-react';

const Register = () => {
  const [formData, setFormData] = useState({ fullName: '', phone: '', email: '', password: '' });
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [register, { isLoading }] = useRegisterMutation();

  const handleChange = (e) => setFormData({ ...formData, [e.target.id]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    try {
      const result = await register({
        full_name: formData.fullName,
        phone: formData.phone,
        email: formData.email || undefined,
        password: formData.password,
      }).unwrap();
      dispatch(setCredentials({ user: result.data.user, token: result.data.token }));
      navigate('/');
    } catch (err) {
      setError(err.data?.message || 'Registration failed. Please try again.');
    }
  };

  const benefits = [
    'Exclusive member pricing',
    'Faster checkout process',
    'Track orders and repairs instantly',
    'Priority support',
  ];

  return (
    <div className="container relative flex min-h-[80vh] flex-col items-center justify-center md:grid lg:max-w-none lg:grid-cols-2 lg:px-0 py-10">
      <Link to="/" className="absolute left-4 top-4 md:left-8 md:top-8 flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors z-20">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back
      </Link>

      <div className="lg:p-8 w-full max-w-[450px] mx-auto order-2 lg:order-1 mt-8 lg:mt-0">
        <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[380px]">
          <div className="flex flex-col space-y-2 text-center lg:text-left">
            <h1 className="text-3xl font-semibold tracking-tight">Create an account</h1>
            <p className="text-sm text-muted-foreground">Enter your details below to create your account</p>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none" htmlFor="fullName">Full Name <span className="text-destructive">*</span></label>
              <Input id="fullName" placeholder="John Doe" disabled={isLoading} value={formData.fullName} onChange={handleChange} required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none" htmlFor="phone">Phone Number <span className="text-destructive">*</span></label>
              <Input id="phone" placeholder="017XXXXXXXX" type="tel" disabled={isLoading} value={formData.phone} onChange={handleChange} required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none" htmlFor="email">
                Email <span className="text-muted-foreground font-normal">(Optional)</span>
              </label>
              <Input id="email" placeholder="m@example.com" type="email" disabled={isLoading} value={formData.email} onChange={handleChange} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none" htmlFor="password">Password <span className="text-destructive">*</span></label>
              <Input id="password" type="password" placeholder="Min. 6 characters" disabled={isLoading} value={formData.password} onChange={handleChange} required />
            </div>
            <Button className="w-full mt-6" type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Register Now
            </Button>
          </form>

          <p className="px-8 text-center text-sm text-muted-foreground">
            By clicking register, you agree to our{' '}
            <Link to="/terms" className="underline underline-offset-4 hover:text-primary">Terms of Service</Link>{' '}and{' '}
            <Link to="/privacy" className="underline underline-offset-4 hover:text-primary">Privacy Policy</Link>.
          </p>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link to="/login" className="underline underline-offset-4 hover:text-primary font-medium">Sign in</Link>
          </p>
        </div>
      </div>

      <div className="relative hidden lg:flex h-full flex-col bg-muted p-10 text-white border-l overflow-hidden order-1 lg:order-2 rounded-l-3xl">
        <div className="absolute inset-0 bg-slate-900" />
        <img
          src="https://images.unsplash.com/photo-1550009158-9effb6bb30ed?auto=format&fit=crop&w=1200&q=80"
          alt="Register Background"
          className="absolute inset-0 object-cover opacity-30 mix-blend-overlay w-full h-full"
        />
        <div className="relative z-20 flex flex-col justify-center h-full max-w-md mx-auto">
          <h2 className="text-3xl font-bold mb-6">Join Premium Gadget</h2>
          <ul className="space-y-4">
            {benefits.map((benefit) => (
              <li key={benefit} className="flex items-center text-slate-200">
                <CheckCircle className="mr-3 h-5 w-5 text-green-400 shrink-0" />
                {benefit}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Register;
