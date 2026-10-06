import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { RouteLoading } from "@/components/RouteLoading";
import { loginPathFor } from "@/lib/authRedirect";

interface ProtectedRouteProps {
  children: ReactNode;
}

export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <RouteLoading label="Checking your Zuup session…" />;

  if (!user) return <Navigate to={loginPathFor(location)} replace />;

  return <>{children}</>;
};

export default ProtectedRoute;
