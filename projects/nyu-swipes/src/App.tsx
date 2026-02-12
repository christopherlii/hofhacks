import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useStore } from '@/store';
import { AppLayout } from '@/components/layout/AppLayout';
import { AuthPage } from '@/pages/Auth';
import { HomePage } from '@/pages/Home';
import { OrderPage } from '@/pages/Order';

import React, { Suspense } from 'react';

const SellPage = React.lazy(() => import('@/pages/Sell').then(m => ({ default: m.SellPage })));
const ProfilePage = React.lazy(() => import('@/pages/Profile').then(m => ({ default: m.ProfilePage })));
const CheckoutPage = React.lazy(() => import('@/pages/Checkout').then(m => ({ default: m.CheckoutPage })));
const OrdersPage = React.lazy(() => import('@/pages/Orders').then(m => ({ default: m.OrdersPage })));
const NotificationsPage = React.lazy(() => import('@/pages/Notifications').then(m => ({ default: m.NotificationsPage })));

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useStore((state) => state.isAuthenticated);
  
  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }
  
  return <>{children}</>;
}

function App() {
  const isAuthenticated = useStore((state) => state.isAuthenticated);

  return (
    <BrowserRouter>
      <Routes>
        <Route 
          path="/auth" 
          element={isAuthenticated ? <Navigate to="/" replace /> : <AuthPage />} 
        />
        
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Suspense fallback={<LoadingSpinner />}>
                  <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/order" element={<OrderPage />} />
                    <Route path="/sell" element={<SellPage />} />
                    <Route path="/profile" element={<ProfilePage />} />
                    <Route path="/checkout" element={<CheckoutPage />} />
                    <Route path="/orders" element={<OrdersPage />} />
                    <Route path="/notifications" element={<NotificationsPage />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Suspense>
              </AppLayout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
