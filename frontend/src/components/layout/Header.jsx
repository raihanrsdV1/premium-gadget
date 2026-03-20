import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingCart, Search, Menu, UserCircle, LogOut, Package, Heart, LayoutDashboard, X, ChevronDown } from 'lucide-react';
import { Button } from '../ui/Button';
import { useSelector, useDispatch } from 'react-redux';
import { logout } from '../../store/slices/authSlice';

const Header = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const menuRef = useRef(null);

  const { totalQuantity } = useSelector(state => state.cart);
  const { isAuthenticated, user } = useSelector(state => state.auth);
  const isAdmin = user?.role === 'super_admin' || user?.role === 'branch_admin';

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setMobileMenuOpen(false);
    }
  };

  const handleLogout = () => {
    dispatch(logout());
    setUserMenuOpen(false);
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center gap-4">

        {/* Logo */}
        <Link to="/" className="flex items-center shrink-0">
          <span className="font-bold text-xl bg-clip-text text-transparent bg-gradient-to-r from-primary to-blue-600">
            Premium Gadget
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium ml-4">
          <Link to="/products" className="text-foreground/60 hover:text-foreground transition-colors">Laptops</Link>
          <Link to="/products?category=accessories" className="text-foreground/60 hover:text-foreground transition-colors">Accessories</Link>
          <Link to="/repairs" className="text-foreground/60 hover:text-foreground transition-colors">Repairs</Link>
          <Link to="/repairs/track" className="text-foreground/60 hover:text-foreground transition-colors">Track Repair</Link>
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Search — desktop */}
        <form onSubmit={handleSearch} className="relative hidden md:block">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search products..."
            className="h-9 w-[220px] lg:w-[320px] rounded-md border border-input bg-background px-3 py-1 pl-8 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </form>

        {/* Cart */}
        <Link to="/cart">
          <Button variant="ghost" size="icon" className="relative shrink-0">
            <ShoppingCart className="h-5 w-5" />
            {totalQuantity > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                {totalQuantity}
              </span>
            )}
            <span className="sr-only">Cart</span>
          </Button>
        </Link>

        {/* Auth area */}
        {isAuthenticated ? (
          /* ── User dropdown ── */
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setUserMenuOpen(v => !v)}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium hover:bg-accent transition-colors"
            >
              <UserCircle className="h-5 w-5 text-primary" />
              <span className="hidden md:block max-w-[100px] truncate">{user?.full_name?.split(' ')[0] || 'Account'}</span>
              <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-52 rounded-xl border bg-background shadow-lg py-1 z-50">
                {/* User info header */}
                <div className="px-4 py-2.5 border-b">
                  <p className="text-sm font-semibold truncate">{user?.full_name || 'User'}</p>
                  <p className="text-xs text-muted-foreground capitalize">{user?.role?.replace('_', ' ') || 'Customer'}</p>
                </div>

                {/* Links */}
                {isAdmin ? (
                  <Link
                    to="/admin"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2 text-sm hover:bg-accent transition-colors"
                  >
                    <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
                    Admin Dashboard
                  </Link>
                ) : (
                  <>
                    <Link
                      to="/orders"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2 text-sm hover:bg-accent transition-colors"
                    >
                      <Package className="h-4 w-4 text-muted-foreground" />
                      My Orders
                    </Link>
                    <Link
                      to="/wishlist"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2 text-sm hover:bg-accent transition-colors"
                    >
                      <Heart className="h-4 w-4 text-muted-foreground" />
                      Wishlist
                    </Link>
                  </>
                )}

                <div className="border-t mt-1 pt-1">
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                    Log Out
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ── Guest buttons ── */
          <div className="hidden md:flex items-center gap-2">
            <Link to="/login">
              <Button variant="ghost" size="sm">Log In</Button>
            </Link>
            <Link to="/register">
              <Button size="sm">Sign Up</Button>
            </Link>
          </div>
        )}

        {/* Mobile hamburger */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden shrink-0"
          onClick={() => setMobileMenuOpen(v => !v)}
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t bg-background px-4 py-4 space-y-4">
          {/* Mobile search */}
          <form onSubmit={handleSearch}>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products..."
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 pl-8 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </form>

          {/* Nav links */}
          <nav className="flex flex-col gap-1">
            {[
              { to: '/products', label: 'Laptops' },
              { to: '/products?category=accessories', label: 'Accessories' },
              { to: '/repairs', label: 'Repairs' },
              { to: '/repairs/track', label: 'Track Repair' },
            ].map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium text-foreground/70 hover:bg-accent hover:text-foreground transition-colors"
              >
                {label}
              </Link>
            ))}
          </nav>

          {/* Auth */}
          <div className="border-t pt-4">
            {isAuthenticated ? (
              <div className="space-y-1">
                <p className="px-3 text-xs text-muted-foreground mb-2">
                  Signed in as <span className="font-semibold text-foreground">{user?.full_name}</span>
                </p>
                {isAdmin ? (
                  <Link to="/admin" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent">
                    <LayoutDashboard className="h-4 w-4" /> Admin Dashboard
                  </Link>
                ) : (
                  <>
                    <Link to="/orders" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent">
                      <Package className="h-4 w-4" /> My Orders
                    </Link>
                    <Link to="/wishlist" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent">
                      <Heart className="h-4 w-4" /> Wishlist
                    </Link>
                  </>
                )}
                <button onClick={handleLogout} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive hover:bg-destructive/10">
                  <LogOut className="h-4 w-4" /> Log Out
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Link to="/login" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="outline" className="w-full">Log In</Button>
                </Link>
                <Link to="/register" onClick={() => setMobileMenuOpen(false)}>
                  <Button className="w-full">Sign Up</Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;
