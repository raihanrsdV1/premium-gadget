"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Heart, LayoutDashboard, LogOut, Menu, Package, Phone, Search, ShoppingCart, UserCircle, X } from "lucide-react";
import { useSelector, useDispatch } from "react-redux";
import { logout } from "@/store/slices/authSlice";
import { SITE } from "@/lib/site";
import { useModalA11y } from "@/hooks/useModalA11y";
import SearchCombobox from "./SearchCombobox";
import MegaNav from "./MegaNav";
import MobileDrawer from "./MobileDrawer";
import ThemeToggle from "./ThemeToggle";
import BrandLogo from "@/components/ui/BrandLogo";

const iconBtn =
  "relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function SearchOverlay({ onClose }) {
  const ref = useModalA11y(true, onClose);
  return (
    <div className="fixed inset-0 z-[80] md:hidden">
      <div className="absolute inset-0 bg-navy/60" onClick={onClose} aria-hidden="true" />
      <div ref={ref} role="dialog" aria-modal="true" aria-label="Search" className="absolute inset-x-0 top-0 max-h-full animate-[pg-pop_.18s_ease_both] bg-background p-3 shadow-float">
        <div className="flex items-start gap-2">
          <SearchCombobox autoFocus onDone={onClose} className="min-w-0 flex-1" idPrefix="m-search" />
          <button type="button" onClick={onClose} aria-label="Close search" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-accent">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Site header: logo, typeahead search, theme, wishlist, account, cart, plus the
 * category bar / mega menu (desktop) and drawer (mobile). The announcement
 * ticker is a separate sibling (see app/layout.jsx) so only this bar is sticky.
 * @param {{ menu: { categories: object[] }|null }} props
 */
export default function Header({ menu }) {
  const categories = menu?.categories || [];
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const router = useRouter();
  const dispatch = useDispatch();
  const userRef = useRef(null);

  const totalQuantity = useSelector((state) => state.cart.totalQuantity);
  const { isAuthenticated, user } = useSelector((state) => state.auth);
  const isAdmin = user?.role === "super_admin" || user?.role === "branch_admin";

  useEffect(() => {
    const onDown = (e) => {
      if (userRef.current && !userRef.current.contains(e.target)) setUserMenuOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setUserMenuOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const handleLogout = () => {
    dispatch(logout());
    setUserMenuOpen(false);
    setDrawerOpen(false);
    router.push("/");
  };

  const menuItem = "flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-accent transition-colors";

  return (
    <header className="pg-glass-bar sticky top-0 z-50 w-full">
      <div className="container flex h-16 items-center gap-0.5 xs:gap-1.5 sm:gap-3 md:h-[72px]">
        <button type="button" className={`${iconBtn} md:hidden -ml-2`} onClick={() => setDrawerOpen(true)} aria-label="Open menu" aria-haspopup="dialog">
          <Menu className="h-6 w-6" />
        </button>

        <Link href="/" className="flex shrink-0 items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Premium Gadget home">
          <BrandLogo wordmark="responsive" priority markClassName="h-8 w-8 sm:h-10 sm:w-10 md:h-11 md:w-11" textClassName="text-base sm:text-lg md:text-xl" />
        </Link>

        {/* Desktop search */}
        <div className="hidden min-w-0 flex-1 px-2 md:block lg:px-8">
          <SearchCombobox className="mx-auto max-w-2xl" />
        </div>
        <div className="flex-1 md:hidden" />

        <a href={`tel:${SITE.phoneE164}`} className="hidden h-10 shrink-0 items-center gap-2 rounded-full border-[1.5px] border-foreground/25 px-4 text-sm font-bold hover:bg-accent xl:flex" aria-label={`Call ${SITE.phoneDisplay}`}>
          <Phone className="h-4 w-4" aria-hidden="true" />{SITE.phoneDisplay}
        </a>

        <button type="button" className={`${iconBtn} md:hidden`} onClick={() => setSearchOpen(true)} aria-label="Search" aria-haspopup="dialog">
          <Search className="h-5 w-5" />
        </button>
        <ThemeToggle />
        <Link href="/wishlist" className={`${iconBtn} hidden sm:inline-flex`} aria-label="Wishlist">
          <Heart className="h-5 w-5" />
        </Link>

        {/* Account */}
        {isAuthenticated ? (
          <div className="relative hidden md:block" ref={userRef}>
            <button
              type="button"
              onClick={() => setUserMenuOpen((v) => !v)}
              aria-expanded={userMenuOpen}
              aria-haspopup="menu"
              className="flex h-10 items-center gap-2 rounded-full bg-tint px-3 text-sm font-semibold hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <UserCircle className="h-5 w-5 text-primary" aria-hidden="true" />
              <span className="max-w-[90px] truncate">{user?.full_name?.split(" ")[0] || "Account"}</span>
              <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${userMenuOpen ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
            {userMenuOpen && (
              <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-border bg-popover py-1 shadow-float">
                <div className="border-b border-border px-4 py-2.5">
                  <p className="truncate text-sm font-semibold">{user?.full_name || "User"}</p>
                  <p className="text-xs capitalize text-muted-foreground">{user?.role?.replace("_", " ") || "Customer"}</p>
                </div>
                {isAdmin ? (
                  <Link role="menuitem" href="/admin" onClick={() => setUserMenuOpen(false)} className={menuItem}><LayoutDashboard className="h-4 w-4 text-muted-foreground" />Admin Dashboard</Link>
                ) : (
                  <>
                    <Link role="menuitem" href="/orders" onClick={() => setUserMenuOpen(false)} className={menuItem}><Package className="h-4 w-4 text-muted-foreground" />My Orders</Link>
                    <Link role="menuitem" href="/wishlist" onClick={() => setUserMenuOpen(false)} className={menuItem}><Heart className="h-4 w-4 text-muted-foreground" />Wishlist</Link>
                  </>
                )}
                <div className="mt-1 border-t border-border pt-1">
                  <button role="menuitem" type="button" onClick={handleLogout} className={`${menuItem} w-full text-destructive`}><LogOut className="h-4 w-4" />Log Out</button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <Link href="/login" className={`${iconBtn} hidden md:inline-flex bg-tint`} aria-label="Log in or sign up" title="Log in">
            <UserCircle className="h-5 w-5" />
          </Link>
        )}

        {/* Cart */}
        <Link href="/cart" className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy text-navy-foreground transition-colors hover:bg-navy/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/85" aria-label={`Cart${totalQuantity > 0 ? `, ${totalQuantity} item${totalQuantity === 1 ? "" : "s"}` : ""}`}>
          <ShoppingCart className="h-5 w-5" aria-hidden="true" />
          {totalQuantity > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-coral px-1 text-[11px] font-extrabold text-coral-foreground">
              {totalQuantity}
            </span>
          )}
        </Link>
      </div>

      <MegaNav categories={categories} />

      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        categories={categories}
        isAuthenticated={isAuthenticated}
        user={user}
        isAdmin={isAdmin}
        onLogout={handleLogout}
      />
      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} />}
    </header>
  );
}
