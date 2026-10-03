import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * List filters kept in the URL query so a refresh (or a shared link) keeps
 * the view.
 *   const [f, setF] = useUrlFilters({ status: 'pending', page: '1' });
 *   setF({ q: 'abc' })            // also resets page to 1
 *   setF({ page: 3 }, { keepPage: true })
 * Empty values are removed from the URL.
 */
export const useUrlFilters = (defaults = {}) => {
  const [params, setParams] = useSearchParams();

  // Defaults are usually an inline literal: key the memo on their content.
  const defaultsKey = JSON.stringify(defaults);
  const values = useMemo(() => {
    const out = JSON.parse(defaultsKey);
    for (const [k, v] of params.entries()) out[k] = v;
    return out;
  }, [params, defaultsKey]);

  const set = useCallback((patch, { keepPage = false, replace = true } = {}) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === null || v === '' || v === false) next.delete(k);
        else next.set(k, String(v));
      }
      if (!keepPage && !('page' in patch)) next.delete('page');
      return next;
    }, { replace });
  }, [setParams]);

  return [values, set];
};

export default useUrlFilters;
