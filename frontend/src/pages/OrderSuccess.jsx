import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';

const OrderSuccess = () => {
  return (
    <div className="container py-24 text-center">
      <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-6" />
      <h1 className="text-4xl font-bold mb-4">Order Placed Successfully!</h1>
      <p className="text-muted-foreground mb-8">Thank you for your purchase. We are processing your order.</p>
      <Link to="/profile" className="text-primary hover:underline font-medium">View Order Status</Link>
    </div>
  );
};

export default OrderSuccess;
