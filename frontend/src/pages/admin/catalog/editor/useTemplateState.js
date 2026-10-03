import { useGetSpecTemplateQuery } from '../../../../store/api/catalogApi';
import { resolveTemplateLocal } from '../../../../components/admin/catalog/catalogUtils';

/**
 * The resolved spec template for a category, as the spec form needs it
 * (GET /categories/:id/spec-template). If the server can't answer (hidden
 * category, or a server without templates yet) it is worked out from the
 * staff category list when possible, else treated as "no template".
 */
export const useTemplateState = (categoryId, categories = []) => {
  const { currentData, isFetching, error } = useGetSpecTemplateQuery(categoryId, { skip: !categoryId });
  const resolved = currentData || (error ? resolveTemplateLocal(categories, categoryId) : null);
  const template = resolved?.template?.groups?.length ? resolved.template : null;
  const sourceId = resolved?.source_category_id || null;
  return {
    loading: !!categoryId && isFetching && !currentData && !error,
    template,
    sourceId,
    sourceName: categories.find((c) => c.id === sourceId)?.name || 'category',
    isInherited: !!sourceId && sourceId !== categoryId,
    unavailable: !!error && !resolved,
  };
};

export default useTemplateState;
