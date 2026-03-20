import React from 'react';

const CartItem = ({ item }) => {
  return (
    <div className="flex items-center gap-4 py-2 border-b">
       {/* Cart Item Stub */}
       Cart Item: {item?.name}
    </div>
  );
};

export default CartItem;
