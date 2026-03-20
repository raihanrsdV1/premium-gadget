import React, { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { logout } from '../../store/slices/authSlice';
import {
  LayoutDashboard, Users, Package, ShoppingCart, Wrench,
  LogOut, MonitorPlay, Tag, BarChart3, GitBranch, Menu, X,
} from 'lucide-react';

// Navigation items with role restrictions
// roles: undefined = all admin roles, otherwise array of allowed roles
const ALL_NAV = [
  { name: 'Dashboard',    href: '/admin',            icon: LayoutDashboard, roles: undefined },
  { name: 'Products',     href: '/admin/products',   icon: Package,         roles: ['super_admin'] },
  { name: 'Orders',       href: '/admin/orders',     icon: ShoppingCart,    roles: undefined },
  { name: 'Repairs',      href: '/admin/repairs',    icon: Wrench,          roles: undefined },
  { name: 'Customers',    href: '/admin/customers',  icon: Users,           roles: ['super_admin'] },
  { name: 'Inventory',    href: '/admin/inventory',  icon: BarChart3,       roles: undefined },
  { name: 'Branches',     href: '/admin/branches',   icon: GitBranch,       roles: ['super_admin'] },
  { name: 'Coupons',      href: '/admin/coupons',    icon: Tag,             roles: ['super_admin'] },
  { name: 'POS Terminal', href: '/admin/pos',        icon: MonitorPlay,     roles: undefined },
];

const ROLE_LABEL = {
  super_admin:  { text: 'Super Admin',  badge: 'bg-red-100 text-red-700' },
  branch_admin: { text: 'Branch Admin', badge: 'bg-amber-100 text-amber-700' },
};

const AdminLayout = () => {
  const location = useLocation();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { user } = useSelector(state => state.auth);
  const role = user?.role || 'branch_admin';
  const roleInfo = ROLE_LABEL[role] || ROLE_LABEL.branch_admin;
  const initials = user?.full_name
    ? user.full_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : 'A';

  const navigation = ALL_NAV.filter(item =>
    !item.roles || item.roles.includes(role)
  );

  const handleLogout = () => {
    dispatch(logout());
    navigate('/');
  };

  const NavLinks = ({ onNavigate }) => (
    <nav className="px-3 space-y-0.5">
      {navigation.map((item) => {
        const isActive = item.href === '/admin'
          ? location.pathname === '/admin'
          : location.pathname.startsWith(item.href);
        return (
          <Link
            key={item.name}
            to={item.href}
            onClick={onNavigate}
            className={`group flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <item.icon className={`shrink-0 h-4 w-4 ${isActive ? 'text-primary-foreground' : 'text-slate-400 group-hover:text-slate-500'}`} />
            {item.name}
          </Link>
        );
      })}
    </nav>
  );

  const SidebarContent = ({ onNavigate }) => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="h-16 flex items-center gap-2 px-5 border-b shrink-0">
        <Link to="/" className="font-bold text-xl text-primary">Premium Gadget</Link>
        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${roleInfo.badge}`}>
          {role === 'super_admin' ? 'SUPER' : 'BRANCH'}
        </span>
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto py-4">
        <NavLinks onNavigate={onNavigate} />
      </div>

      {/* User footer */}
      <div className="p-4 border-t shrink-0 space-y-1">
        <div className="flex items-center gap-3 px-3 py-2 mb-1">
          <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate text-slate-900 dark:text-white">
              {user?.full_name || 'Admin'}
            </p>
            <p className={`text-xs font-medium ${roleInfo.badge.split(' ')[1]} truncate`}>
              {roleInfo.text}
            </p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        >
          <LogOut className="h-4 w-4 text-red-500 shrink-0" />
          Logout
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900">

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 bg-white dark:bg-slate-950 border-r flex-col shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 bg-white dark:bg-slate-950 border-r z-50">
            <SidebarContent onNavigate={() => setSidebarOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top bar */}
        <header className="h-16 flex items-center justify-between px-4 md:px-6 border-b bg-white dark:bg-slate-950 shrink-0 gap-4">
          <div className="flex items-center gap-3">
            {/* Mobile hamburger */}
            <button
              className="md:hidden p-1.5 rounded-md hover:bg-slate-100"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
            {/* Breadcrumb label on desktop */}
            <span className="hidden md:block text-sm text-slate-500">
              {navigation.find(n =>
                n.href === '/admin'
                  ? location.pathname === '/admin'
                  : location.pathname.startsWith(n.href)
              )?.name || 'Admin'}
            </span>
          </div>

          {/* Right: user info */}
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold text-slate-900 dark:text-white leading-tight">
                {user?.full_name || 'Admin'}
              </p>
              <p className={`text-xs font-medium ${roleInfo.badge.split(' ')[1]}`}>
                {roleInfo.text}
              </p>
            </div>
            <div className="h-9 w-9 bg-primary/10 text-primary rounded-full flex items-center justify-center font-bold text-sm shrink-0">
              {initials}
            </div>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;
