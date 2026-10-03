import { useContext } from 'react';
import { ConfirmContext } from '../components/admin/contexts';

/**
 *   const confirm = useConfirm();
 *   if (await confirm({ title: 'Delete product?', body: '…', confirmLabel: 'Delete', danger: true })) …
 */
export const useConfirm = () => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return ctx;
};
