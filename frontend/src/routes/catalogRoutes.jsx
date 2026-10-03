import React from 'react';
import ProductList from '../pages/admin/catalog/ProductList';
import ProductEditor from '../pages/admin/catalog/ProductEditor';
import Categories from '../pages/admin/catalog/Categories';
import Brands from '../pages/admin/catalog/Brands';
import Banners from '../pages/admin/catalog/Banners';
import Collections from '../pages/admin/catalog/Collections';
import ActivityLog from '../pages/admin/ActivityLog';

// Catalog screens (owned by the catalog workstream): products, product
// editor, categories (+ spec templates), brands, homepage banners.
// Paths are relative to /admin.
export const catalogRoutes = [
  { path: 'products', element: <ProductList /> },
  { path: 'products/new', element: <ProductEditor /> },
  { path: 'products/:id', element: <ProductEditor /> },
  { path: 'categories', element: <Categories /> },
  { path: 'brands', element: <Brands /> },
  { path: 'banners', element: <Banners /> },
  { path: 'collections', element: <Collections /> },
  { path: 'activity', element: <ActivityLog /> },
];
