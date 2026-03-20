import { useSelector, useDispatch } from 'react-redux';
import { setCredentials, logout as logoutAction } from '../store/slices/authSlice';

export const useAuth = () => {
  const dispatch = useDispatch();
  const { isAuthenticated, user, token } = useSelector((state) => state.auth);

  const login = (userData, authToken) => {
    dispatch(setCredentials({ user: userData, token: authToken }));
  };

  const logout = () => {
    dispatch(logoutAction());
  };

  return { isAuthenticated, user, token, login, logout };
};
