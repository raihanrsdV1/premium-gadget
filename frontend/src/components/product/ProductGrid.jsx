import React from 'react';
import ProductCard from './ProductCard';

const ProductGrid = ({ products = [] }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {products.map(p => <ProductCard key={p.id} product={p} />)}
    </div>
  );
};

export default ProductGrid;
