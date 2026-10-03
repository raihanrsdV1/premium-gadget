import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Plus, Search, Star, Trash2, X } from 'lucide-react';
import { DataTable, Pagination, Badge, PageHeader } from '../../../components/admin/DataTable';
import { Select, TextInput } from '../../../components/admin/Field';
import { Button } from '../../../components/ui/Button';
import { IconButton, Switch, Thumb, SrOnly } from '../../../components/admin/catalog/CatalogUi';
import { CONDITIONS, conditionInfo } from '../../../components/admin/catalog/catalogUtils';
import { useCategoryList } from '../../../components/admin/catalog/useCategoryList';
import {
  useDeleteProductMutation, useGetAdminProductsQuery, useGetBrandsAdminQuery, useUpdateProductMutation,
} from '../../../store/api/catalogApi';
import { useDebounce } from '../../../hooks/useDebounce';
import { useToast } from '../../../hooks/useToast';
import { useConfirm } from '../../../hooks/useConfirm';
import { errorText } from '../../../lib/apiError';
import { formatBDT } from '../../../lib/format';

const FILTER_KEYS = ['q', 'status', 'category', 'brand', 'condition', 'featured', 'low_stock'];
const PAGE_SIZE = 20;

const PriceCell = ({ row }) => {
  if (row.min_price === null || row.min_price === undefined) return <span className="text-slate-400">No price</span>;
  const max = row.max_price;
  if (max !== undefined && max !== null && Number(max) !== Number(row.min_price)) {
    return <span className="whitespace-nowrap">{formatBDT(row.min_price)} – {formatBDT(max)}</span>;
  }
  return (
    <span className="whitespace-nowrap">
      {row.active_variant_count > 1 && max === undefined && <span className="mr-1 text-xs text-slate-500">from</span>}
      {formatBDT(row.min_price)}
    </span>
  );
};

const ProductList = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const isSuper = useSelector((s) => s.auth.user?.role) === 'super_admin';
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') || '');
  const [busy, setBusy] = useState(null); // `${id}:${field}`

  const debounced = useDebounce(search.trim(), 350);
  const filters = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) || '']));
  const page = Number(params.get('page')) || 1;
  const query = { ...filters, q: debounced, status: filters.status || 'all', page, limit: PAGE_SIZE };

  // Keep the URL in sync with the debounced search box (refresh keeps the view).
  const urlQ = params.get('q') || '';
  useEffect(() => {
    if (debounced === urlQ) return;
    setParams((p) => {
      const next = new URLSearchParams(p);
      if (debounced) next.set('q', debounced); else next.delete('q');
      next.delete('page');
      return next;
    }, { replace: true });
    // Only the typed term drives this; the URL follows it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const { data, isLoading, isFetching, error, refetch } = useGetAdminProductsQuery(query);
  const { flat: categoryOptions } = useCategoryList();
  const { data: brands = [] } = useGetBrandsAdminQuery();
  const [updateProduct] = useUpdateProductMutation();
  const [deleteProduct] = useDeleteProductMutation();

  const setFilter = (key, value) => setParams((p) => {
    const next = new URLSearchParams(p);
    if (value) next.set(key, value); else next.delete(key);
    next.delete('page');
    return next;
  });
  const clearFilters = () => { setSearch(''); setParams({}, { replace: true }); };
  const hasFilters = FILTER_KEYS.some((k) => params.get(k));

  const toggle = async (row, field, value) => {
    setBusy(`${row.id}:${field}`);
    try {
      await updateProduct({ id: row.id, [field]: value }).unwrap();
      toast.success(field === 'is_active'
        ? `${row.name} is now ${value ? 'shown on' : 'hidden from'} the website.`
        : `${row.name} ${value ? 'added to' : 'removed from'} featured products.`);
    } catch (err) {
      toast.error(errorText(err, 'Could not update the product.'));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (row) => {
    const ok = await confirm({
      title: `Delete “${row.name}”?`,
      body: 'It disappears from the website and from this list. Past orders and sales keep their records. To hide it for a while instead, switch it off.',
      confirmLabel: 'Delete product',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteProduct(row.id).unwrap();
      toast.success(`${row.name} deleted.`);
    } catch (err) {
      toast.error(errorText(err, 'Could not delete the product.'));
    }
  };

  const columns = [
    { key: 'image', header: '', className: 'w-14', render: (r) => <Thumb src={r.image} alt="" className="h-11 w-11" /> },
    {
      key: 'name', header: 'Product', render: (r) => (
        <div className="min-w-[220px] max-w-[320px]">
          <Link to={`/admin/products/${r.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-slate-900 hover:text-primary hover:underline">{r.name}</Link>
          <p className="text-xs text-slate-500">
            {r.brand && <>{r.brand} · </>}
            {r.variant_count} variant{r.variant_count === 1 ? '' : 's'}
            {r.active_variant_count < r.variant_count && ` (${r.variant_count - r.active_variant_count} off)`}
            {r.badge && <> · <span className="font-medium text-primary">{r.badge}</span></>}
          </p>
        </div>
      ),
    },
    { key: 'category', header: 'Category', className: 'whitespace-nowrap text-slate-600', render: (r) => r.category || '—' },
    {
      key: 'condition', header: 'Condition', render: (r) => {
        const c = conditionInfo(r.condition);
        return (
          <span className="inline-flex items-center gap-1">
            <Badge tone={c.tone}>{c.label}</Badge>
            {r.condition !== 'new' && r.condition_grade && <span className="text-xs font-medium text-slate-600">Grade {r.condition_grade}</span>}
          </span>
        );
      },
    },
    { key: 'price', header: 'Price', render: (r) => <PriceCell row={r} /> },
    {
      key: 'stock', header: 'Stock', render: (r) => (r.available > 0
        ? <span className="font-medium tabular-nums text-slate-900">{r.available}</span>
        : <Badge tone="red">Out of stock</Badge>),
    },
    {
      key: 'active', header: 'On website', render: (r) => (
        <Switch checked={r.is_active} label={`Show ${r.name} on the website`} busy={busy === `${r.id}:is_active`}
          onChange={(v) => toggle(r, 'is_active', v)} />
      ),
    },
    {
      key: 'featured', header: 'Featured', render: (r) => (
        <button type="button" aria-pressed={r.is_featured} aria-label={r.is_featured ? `Remove ${r.name} from featured` : `Feature ${r.name}`}
          title={r.is_featured ? 'Featured on the homepage' : 'Not featured'} disabled={busy === `${r.id}:is_featured`}
          onClick={(e) => { e.stopPropagation(); toggle(r, 'is_featured', !r.is_featured); }}
          className="rounded-md p-1.5 hover:bg-slate-100 disabled:opacity-50">
          <Star className={`h-5 w-5 ${r.is_featured ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
        </button>
      ),
    },
    ...(isSuper ? [{
      key: 'actions', header: <SrOnly>Actions</SrOnly>, render: (r) => (
        <span onClick={(e) => e.stopPropagation()} className="inline-flex">
          <IconButton icon={Trash2} tone="danger" label={`Delete ${r.name}`} onClick={() => remove(r)} />
        </span>
      ),
    }] : []),
  ];

  return (
    <div>
      <PageHeader title="Products" description="Everything the shop sells. Click a product to edit its details, photos, prices and specs."
        actions={<Button onClick={() => navigate('/admin/products/new')}><Plus className="mr-2 h-4 w-4" />Add product</Button>} />

      <div className="mb-4 space-y-3 rounded-lg border bg-white p-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <TextInput type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or SKU" aria-label="Search products" className="pl-9" />
          </div>
          <Select aria-label="Status" className="w-auto" value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
            <option value="">Any status</option>
            <option value="active">On website</option>
            <option value="inactive">Hidden</option>
          </Select>
          <Select aria-label="Category" className="w-auto max-w-[240px]" value={filters.category} onChange={(e) => setFilter('category', e.target.value)}>
            <option value="">All categories</option>
            {categoryOptions.map((c) => <option key={c.id} value={c.id}>{c.path}</option>)}
          </Select>
          <Select aria-label="Brand" className="w-auto" value={filters.brand} onChange={(e) => setFilter('brand', e.target.value)}>
            <option value="">All brands</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
          <Select aria-label="Condition" className="w-auto" value={filters.condition} onChange={(e) => setFilter('condition', e.target.value)}>
            <option value="">Any condition</option>
            {CONDITIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Select>
          <Select aria-label="Featured" className="w-auto" value={filters.featured} onChange={(e) => setFilter('featured', e.target.value)}>
            <option value="">Featured or not</option>
            <option value="true">Featured only</option>
            <option value="false">Not featured</option>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={filters.low_stock === 'true'} onChange={(e) => setFilter('low_stock', e.target.checked ? 'true' : '')} />
            Low stock only
          </label>
          {hasFilters && (
            <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              <X className="h-3.5 w-3.5" />Clear filters
            </button>
          )}
          {isFetching && !isLoading && <span className="text-xs text-slate-400">Updating…</span>}
          {data?.pagination && <span className="ml-auto text-xs text-slate-500">{data.pagination.total} product{data.pagination.total === 1 ? '' : 's'}</span>}
        </div>
      </div>

      <DataTable columns={columns} rows={data?.rows} loading={isLoading} error={error ? errorText(error, 'Could not load products.') : null} onRetry={refetch}
        onRowClick={(r) => navigate(`/admin/products/${r.id}`)}
        empty={hasFilters ? 'No products match these filters.' : 'No products yet. Add your first one.'} />
      <Pagination pagination={data?.pagination} onPage={(p) => setParams((prev) => { const n = new URLSearchParams(prev); n.set('page', String(p)); return n; })} />
    </div>
  );
};

export default ProductList;
