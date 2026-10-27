import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

export function ProtectedRoute({ children, allowedRoles = ['VENDEDOR', 'BODEGA', 'GERENTE'] }: ProtectedRouteProps) {
  const { vendedor } = useAuth();
  const location = useLocation();

  if (!vendedor) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const userRole = vendedor.usuario.rol.toUpperCase();
  if (!allowedRoles.includes(userRole)) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}