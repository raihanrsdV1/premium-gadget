import { useContext } from 'react';
import { ToastContext } from '../components/admin/contexts';

/** toast.success('Saved') · toast.error(errorText(err)) · toast.info('…') */
export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
};
