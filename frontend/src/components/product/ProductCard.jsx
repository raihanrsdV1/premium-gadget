import React from 'react';
import { Card, CardContent } from '../ui/Card';

const ProductCard = ({ product }) => {
  return (
    <Card className="group overflow-hidden border-border/50 hover:border-primary/30 transition-all hover:shadow-lg">
      <CardContent className="p-4">
         Product Card for {product?.name || 'Item'}
      </CardContent>
    </Card>
  );
};

export default ProductCard;
