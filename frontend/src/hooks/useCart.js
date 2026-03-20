import { useSelector, useDispatch } from 'react-redux';
import { addItem, removeItem, clearCart } from '../store/slices/cartSlice';

export const useCart = () => {
  const dispatch = useDispatch();
  const { items, totalAmount, totalQuantity } = useSelector((state) => state.cart);

  const add = (item) => dispatch(addItem(item));
  const remove = (id) => dispatch(removeItem(id));
  const clear = () => dispatch(clearCart());

  return { items, totalAmount, totalQuantity, add, remove, clear };
};
