import { useMemo } from 'react';
import { useGetCategoriesAdminQuery } from '../../../store/api/catalogApi';
import { flattenCategories } from './catalogUtils';

const EMPTY = [];

/**
 * Staff category list for pickers, filters and the Categories page.
 * → { rows (as the API returns them), flat (tree order with `depth` / `path`), isLoading, error, refetch }
 */
export const useCategoryList = () => {
  const { data, isLoading, error, refetch } = useGetCategoriesAdminQuery();
  const rows = data ?? EMPTY;
  const flat = useMemo(() => flattenCategories(rows), [rows]);
  return { rows, flat, isLoading, error, refetch };
};

export default useCategoryList;
