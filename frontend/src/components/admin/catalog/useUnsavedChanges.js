import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConfirm } from '../../../hooks/useConfirm';

/**
 * Warn before leaving a page with unsaved changes:
 *  - closing / reloading the tab → the browser's own "Leave site?" prompt
 *  - clicking an in-app link (sidebar, breadcrumbs…) → our confirm dialog
 * The app uses <BrowserRouter>, where react-router's useBlocker isn't
 * available, so in-app links are intercepted before React Router sees them.
 */
export const useUnsavedChanges = (dirty, message = 'You have changes that are not saved yet. Leave this page and lose them?') => {
  const confirm = useConfirm();
  const navigate = useNavigate();
  const dirtyRef = useRef(dirty);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    const onClick = async (e) => {
      if (!dirtyRef.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest?.('a[href]');
      if (!a || a.target === '_blank' || a.hasAttribute('download') || a.dataset.noGuard !== undefined) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      const ok = await confirm({ title: 'Leave without saving?', body: message, confirmLabel: 'Leave page', cancelLabel: 'Stay', danger: true });
      if (ok) {
        dirtyRef.current = false;
        navigate(`${url.pathname}${url.search}${url.hash}`);
      }
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [confirm, navigate, message]);
};

export default useUnsavedChanges;
