import React, { useState } from 'react';
import { Outlet, Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  LayoutDashboard, Users, Package, ShoppingCart, Wrench, LogOut, MonitorPlay, Tag, Boxes,
  GitBranch, Menu, X, Settings as SettingsIcon, FlaskConical, FolderTree, BadgeCheck, GalleryHorizontal, Layers, History,
} from 'lucide-react';
import { logout } from '../../store/slices/authSlice';
import { apiSlice } from '../../store/api/apiSlice';
import { LIVE_PATHS } from '../../config/livePages';
import { BrandLogo } from '../admin/BrandLogo';

// Sidebar groups. `roles` limits an item to those roles (the API enforces the
// same rules; hiding just keeps the menu honest).
const NAV = [
  { group: null, items: [{ name: 'Dashboard', href: '/admin', icon: LayoutDashboard, end: true }] },
  { group: 'Sales', items: [
    { name: 'Orders', href: '/admin/orders', icon: ShoppingCart },
    { name: 'POS (in-store sale)', href: '/admin/pos', icon: MonitorPlay },
  ] },
  { group: 'Catalog', items: [
    { name: 'Products', href: '/admin/products', icon: Package },
    { name: 'Categories', href: '/admin/categories', icon: FolderTree },
    { name: 'Brands', href: '/admin/brands', icon: BadgeCheck },
    { name: 'Homepage banners', href: '/admin/banners', icon: GalleryHorizontal },
    { name: 'Collections', href: '/admin/collections', icon: Layers },
  ] },
  { group: 'Stock & service', items: [
    { name: 'Inventory', href: '/admin/inventory', icon: Boxes },
    { name: 'Repairs', href: '/admin/repairs', icon: Wrench },
  ] },
  { group: 'Setup', items: [
    { name: 'Customers & staff', href: '/admin/customers', icon: Users, roles: ['super_admin'] },
    { name: 'Branches', href: '/admin/branches', icon: GitBranch, roles: ['super_admin'] },
    { name: 'Coupons', href: '/admin/coupons', icon: Tag, roles: ['super_admin'] },
    { name: 'Activity log', href: '/admin/activity', icon: History, roles: ['super_admin'] },
    { name: 'Settings', href: '/admin/settings', icon: SettingsIcon },
  ] },
];

const ROLE_LABEL = { super_admin: 'Super admin', branch_admin: 'Branch staff' };

const SidebarContent = ({ role, user, onNavigate, onLogout }) => (
  <div className="flex h-full flex-col">
    <div className="flex h-16 shrink-0 items-center border-b px-4">
      <Link to="/admin" onClick={onNavigate} aria-label="Premium Gadget dashboard"><BrandLogo size="sm" /></Link>
    </div>
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Admin">
      {NAV.map((section) => {
        const items = section.items.filter((i) => !i.roles || i.roles.includes(role));
        if (!items.length) return null;
        return (
          <div key={section.group || 'top'}>
            {section.group && <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{section.group}</p>}
            <div className="space-y-0.5">
              {items.map((item) => (
                <NavLink key={item.href} to={item.href} end={item.end} onClick={onNavigate}
                  className={({ isActive }) => `group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive ? 'bg-primary text-primary-foreground' : 'text-slate-700 hover:bg-slate-100'}`}>
                  {({ isActive }) => (<><item.icon className={`h-4 w-4 shrink-0 ${isActive ? '' : 'text-slate-400 group-hover:text-slate-600'}`} />{item.name}</>)}
                </NavLink>
              ))}
            </div>
          </div>
        );
      })}
    </nav>
    <div className="shrink-0 space-y-1 border-t p-4">
      <div className="flex items-center gap-3 px-2 py-1">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
          {(user?.full_name || 'A').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{user?.full_name || 'Staff'}</p>
          <p className="truncate text-xs text-slate-500">{ROLE_LABEL[role] || role}</p>
        </div>
      </div>
      <button onClick={onLogout} className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
        <LogOut className="h-4 w-4" /> Sign out
      </button>
    </div>
  </div>
);

const AdminLayout = () => {
  const location = useLocation();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { user } = useSelector((s) => s.auth);
  const role = user?.role;

  const handleLogout = () => {
    dispatch(logout());
    dispatch(apiSlice.util.resetApiState()); // shared shop PCs: drop cached data
    navigate('/login');
  };

  const current = NAV.flatMap((s) => s.items).find((i) => (i.end ? location.pathname === i.href : location.pathname.startsWith(i.href)));
  const isLive = LIVE_PATHS.some((p) => location.pathname.startsWith(p));

  return (
    <div className="flex h-screen bg-slate-50">
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-white md:flex">
        <SidebarContent role={role} user={user} onLogout={handleLogout} />
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 z-50 h-full w-64 border-r bg-white">
            <SidebarContent role={role} user={user} onNavigate={() => setOpen(false)} onLogout={handleLogout} />
          </aside>
        </div>
      )}

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b bg-white px-4 md:px-6">
          <button className="rounded-md p-1.5 hover:bg-slate-100 md:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <span className="text-sm font-medium text-slate-500">{current?.name || 'Admin'}</span>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          {!isLive && (
            <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <FlaskConical className="mt-0.5 h-5 w-5 shrink-0" />
              <p><b>Preview only.</b> This page still shows sample data and isn&apos;t connected to the shop&apos;s database yet — changes here are not saved.</p>
            </div>
          )}
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;
