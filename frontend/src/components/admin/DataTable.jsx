import React from 'react';
import { ChevronLeft, ChevronRight, Inbox, Loader2 } from 'lucide-react';
import { Button } from '../ui/Button';

/**
 * Table with loading / empty / error states.
 *   <DataTable columns={[{ key: 'name', header: 'Name', render: (row) => … , className }]}
 *              rows={data} rowKey="id" loading={isLoading} error={err} onRowClick={…} empty="No products yet" />
 * Wide tables scroll horizontally inside their card on small screens.
 */
export const DataTable = ({ columns, rows = [], rowKey = 'id', loading, error, onRetry, onRowClick, empty = 'Nothing here yet', dense }) => {
  const pad = dense ? 'px-3 py-2' : 'px-4 py-3';
  return (
    <div className="overflow-x-auto rounded-lg border bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>{columns.map((c) => <th key={c.key} scope="col" className={`${pad} whitespace-nowrap ${c.headerClassName || ''}`}>{c.header}</th>)}</tr>
        </thead>
        <tbody className="divide-y">
          {loading && (
            <tr><td colSpan={columns.length} className="px-4 py-12 text-center text-slate-500"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
          )}
          {!loading && error && (
            <tr><td colSpan={columns.length} className="px-4 py-10 text-center">
              <p className="text-sm text-red-600">{error}</p>
              {onRetry && <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>Try again</Button>}
            </td></tr>
          )}
          {!loading && !error && rows.length === 0 && (
            <tr><td colSpan={columns.length} className="px-4 py-12 text-center text-slate-500">
              <Inbox className="mx-auto mb-2 h-6 w-6 text-slate-400" />{empty}
            </td></tr>
          )}
          {!loading && !error && rows.map((row) => (
            <tr key={row[rowKey]} onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={onRowClick ? 'cursor-pointer hover:bg-slate-50' : ''}>
              {columns.map((c) => <td key={c.key} className={`${pad} align-middle ${c.className || ''}`}>{c.render ? c.render(row) : row[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/** Pagination for the API's `pagination` object. */
export const Pagination = ({ pagination, onPage }) => {
  if (!pagination || pagination.totalPages <= 1) return null;
  const { page, totalPages, total } = pagination;
  return (
    <div className="flex items-center justify-between gap-4 pt-3 text-sm text-slate-600">
      <span>{total} total · page {page} of {totalPages}</span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={!pagination.hasPrev} onClick={() => onPage(page - 1)}><ChevronLeft className="h-4 w-4" />Prev</Button>
        <Button variant="outline" size="sm" disabled={!pagination.hasNext} onClick={() => onPage(page + 1)}>Next<ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
};

const BADGE = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  blue: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
  slate: 'bg-slate-100 text-slate-700 ring-slate-500/20',
  violet: 'bg-violet-50 text-violet-700 ring-violet-600/20',
};

export const Badge = ({ tone = 'slate', children }) => (
  <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${BADGE[tone]}`}>{children}</span>
);

export const PageHeader = ({ title, description, actions }) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
  </div>
);
