import React, { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Pagination } from '@/components/admin/DataTable';
import { Select } from '@/components/admin/Field';
import { Button } from '@/components/ui/Button';
import {
  BranchFilter, DateRange, FilterField, SearchBox,
} from '@/components/admin/ops/OpsUi';
import { MOVEMENT_TYPE } from '@/components/admin/ops/labels';
import { useGetMovementsQuery } from '@/store/api/opsApi';
import { errorText } from '@/lib/apiError';
import MovementsTable from './MovementsTable';

/** The stock ledger: every change to stock, newest first. */
const MovementsTab = ({ f, setF, isSuper }) => {
  const [searchKey, setSearchKey] = useState(0);
  const { data, isLoading, isFetching, error, refetch } = useGetMovementsQuery({
    branch_id: isSuper ? f.branch_id : undefined,
    movement_type: f.type,
    performer: f.by,
    from: f.from,
    to: f.to,
    page: f.page,
    limit: 25,
  });
  const hasFilters = ['type', 'by', 'from', 'to'].some((k) => f[k]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-white p-3">
        <BranchFilter id="mv-branch" value={f.branch_id} onChange={(branch_id) => setF({ branch_id })} className="w-48" />
        <FilterField label="Type of change" htmlFor="mv-type">
          <Select id="mv-type" value={f.type || ''} onChange={(e) => setF({ type: e.target.value })} className="w-52">
            <option value="">All changes</option>
            {Object.entries(MOVEMENT_TYPE).map(([v, { label }]) => <option key={v} value={v}>{label}</option>)}
          </Select>
        </FilterField>
        <SearchBox key={searchKey} id="mv-by" label="Done by" value={f.by} onSearch={(by) => setF({ by })} placeholder="Staff name" className="w-48" />
        <DateRange idPrefix="mv" from={f.from} to={f.to} onChange={({ from, to }) => setF({ from, to })} />
        {hasFilters && (
          <Button variant="ghost" size="sm" className="mb-0.5" onClick={() => { setF({ type: '', by: '', from: '', to: '' }); setSearchKey((k) => k + 1); }}>
            <RotateCcw className="mr-1.5 h-4 w-4" />Clear filters
          </Button>
        )}
      </div>
      <div className={isFetching && !isLoading ? 'opacity-60 transition-opacity' : ''}>
        <MovementsTable rows={data?.data || []} loading={isLoading} error={error ? errorText(error) : null} onRetry={refetch}
          empty={hasFilters ? 'No stock changes match these filters.' : 'No stock changes recorded yet.'} />
      </div>
      <Pagination pagination={data?.pagination} onPage={(page) => setF({ page }, { keepPage: true })} />
    </div>
  );
};

export default MovementsTab;
