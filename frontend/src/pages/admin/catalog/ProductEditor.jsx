import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { useGetAdminProductQuery, useGetBrandsAdminQuery } from '../../../store/api/catalogApi';
import { useGetBranchesAdminQuery } from '../../../store/api/commonApi';
import { useCategoryList } from '../../../components/admin/catalog/useCategoryList';
import { errorText } from '../../../lib/apiError';
import { NewProduct } from './editor/NewProduct';
import { ExistingProduct } from './editor/ExistingProduct';

const EMPTY = [];

const Centered = ({ children }) => <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">{children}</div>;

/** /admin/products/new and /admin/products/:id */
const ProductEditor = () => {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const cats = useCategoryList();
  const { data: brands = EMPTY, isLoading: brandsLoading } = useGetBrandsAdminQuery();
  const { data: branches = EMPTY, isLoading: branchesLoading } = useGetBranchesAdminQuery();
  const { data: product, isLoading, error, refetch } = useGetAdminProductQuery(id, { skip: isNew });

  if (cats.isLoading || brandsLoading || branchesLoading || (!isNew && isLoading)) {
    return <Centered><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></Centered>;
  }
  if (!isNew && (error || !product)) {
    return (
      <Centered>
        <p className="text-sm text-red-600">{error?.status === 404 ? 'This product was not found. It may have been deleted.' : errorText(error, 'Could not load the product.')}</p>
        <div className="flex gap-2">
          {error?.status !== 404 && <Button variant="outline" onClick={refetch}>Try again</Button>}
          <Link to="/admin/products" className="inline-flex h-10 items-center gap-1 rounded-md px-4 text-sm font-medium text-primary hover:underline"><ArrowLeft className="h-4 w-4" />All products</Link>
        </div>
      </Centered>
    );
  }

  return (
    <>
      {cats.error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Could not load categories: {errorText(cats.error)} <button type="button" className="font-medium underline" onClick={cats.refetch}>Try again</button>
        </p>
      )}
      {isNew
        ? <NewProduct categories={cats.flat} brands={brands} branches={branches} />
        : <ExistingProduct key={product.id} product={product} categories={cats.flat} brands={brands} branches={branches} />}
    </>
  );
};

export default ProductEditor;
