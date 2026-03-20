import React from 'react';

const CartSummary = ({ items, total }) => {
  return (
    <div className="bg-secondary/10 p-4 rounded-lg">
       {/* Cart Summary Stub */}
       <h3 className="font-bold border-b pb-2 mb-2">Order Summary</h3>
       <p>Total: ৳{total}</p>
    </div>
  );
};

export default CartSummary;
