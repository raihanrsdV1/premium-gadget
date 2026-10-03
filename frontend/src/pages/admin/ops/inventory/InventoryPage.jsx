import React, { useCallback, useState } from 'react';
import { useSelector } from 'react-redux';
import { Boxes, History, Laptop, PackagePlus, ScanBarcode } from 'lucide-react';
import { PageHeader } from '@/components/admin/DataTable';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/admin/ops/OpsUi';
import { useUrlFilters } from '@/components/admin/ops/useUrlFilters';
import StockTab from './StockTab';
import MovementsTab from './MovementsTab';
import UnitsTab from './UnitsTab';
import { AddToBranchModal } from './StockModals';
import { ReceiveUnitModal } from './UnitModals';

const TABS = [
  { value: 'stock', label: 'Stock', icon: Boxes },
  { value: 'movements', label: 'Stock history', icon: History },
  { value: 'units', label: 'Serial units', icon: ScanBarcode },
];

/**
 * /admin/inventory — stock per branch, the stock ledger and the serial
 * register for used laptops. Supports ?q=<sku> (the product editor links here).
 */
const InventoryPage = () => {
  const user = useSelector((s) => s.auth.user);
  const isSuper = user?.role === 'super_admin';
  const [f, setF] = useUrlFilters({ tab: 'stock', page: '1' });
  const [modal, setModal] = useState(null); // 'add' | 'unit'
  const close = useCallback(() => setModal(null), []);

  // Branch the top actions start with: the filter (super admin) or the user's own.
  const defaultBranch = (isSuper ? f.branch_id : null) || user?.branch_id || '';

  return (
    <div className="space-y-4">
      <PageHeader
        title="Inventory"
        description="Stock at each branch. Every change is recorded in the stock history."
        actions={<>
          <Button variant="outline" onClick={() => setModal('unit')}><Laptop className="mr-2 h-4 w-4" />Receive used laptop (serial)</Button>
          <Button onClick={() => setModal('add')}><PackagePlus className="mr-2 h-4 w-4" />Add product to a branch</Button>
        </>}
      />

      <Tabs label="Inventory views" tabs={TABS} value={f.tab} onChange={(tab) => setF({ tab })} />

      {f.tab === 'movements' && <MovementsTab f={f} setF={setF} isSuper={isSuper} />}
      {f.tab === 'units' && <UnitsTab f={f} setF={setF} isSuper={isSuper} />}
      {f.tab !== 'movements' && f.tab !== 'units' && <StockTab f={f} setF={setF} isSuper={isSuper} />}

      {modal === 'add' && <AddToBranchModal defaultBranch={defaultBranch} onClose={close} />}
      {modal === 'unit' && <ReceiveUnitModal defaultBranch={defaultBranch} onClose={close} />}
    </div>
  );
};

export default InventoryPage;
