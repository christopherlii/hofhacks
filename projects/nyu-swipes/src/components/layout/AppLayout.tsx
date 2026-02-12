import { Link, useLocation } from 'react-router-dom';
import { Home, ShoppingBag, DollarSign, User, ClipboardList, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@/store';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface AppLayoutProps {
  children: React.ReactNode;
}

const sidebarNav = [
  { path: '/', icon: Home, label: 'Home' },
  { path: '/order', icon: ShoppingBag, label: 'Order Food' },
  { path: '/sell', icon: DollarSign, label: 'Sell Swipes' },
  { path: '/orders', icon: ClipboardList, label: 'My Orders' },
];

const mobileNav = [
  { path: '/', icon: Home, label: 'Home' },
  { path: '/order', icon: ShoppingBag, label: 'Order' },
  { path: '/sell', icon: DollarSign, label: 'Sell' },
  { path: '/profile', icon: User, label: 'Profile' },
];

export function AppLayout({ children }: AppLayoutProps) {
  const location = useLocation();
  const user = useStore((state) => state.user);
  const setUser = useStore((state) => state.setUser);
  const clearCart = useStore((state) => state.clearCart);

  const handleLogout = () => {
    setUser(null);
    clearCart();
  };

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    // Exact match for these paths to avoid /order matching /orders
    if (path === '/order') return location.pathname === '/order' || location.pathname.startsWith('/order?');
    if (path === '/orders') return location.pathname === '/orders' || location.pathname.startsWith('/orders/');
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-[220px] lg:fixed lg:inset-y-0 border-r bg-background">
        {/* Logo */}
        <div className="flex items-center h-14 px-5">
          <div className="w-8 h-8 bg-violet-600 flex items-center justify-center">
            <span className="text-white text-sm font-bold">SS</span>
          </div>
          <span className="ml-3 font-semibold">SwipeSwap</span>
        </div>

        <Separator />

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {sidebarNav.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-violet-50 font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <Separator />

        {/* User profile */}
        <div className="p-3">
          <Link
            to="/profile"
            className={cn(
              "flex items-center gap-3 p-2 transition-colors",
              isActive('/profile') ? "bg-violet-50" : "hover:bg-muted"
            )}
          >
            <div className="w-9 h-9 bg-violet-100 flex items-center justify-center text-sm font-medium text-violet-700">
              {user?.name?.charAt(0) || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="w-full mt-2 justify-start text-muted-foreground"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign out
          </Button>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="lg:hidden sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-violet-600 flex items-center justify-center">
              <span className="text-white text-sm font-bold">SS</span>
            </div>
            <span className="font-semibold">SwipeSwap</span>
          </div>
          
          <Link to="/profile" className="flex items-center">
            <div className="w-8 h-8 bg-violet-100 flex items-center justify-center text-sm font-medium text-violet-700">
              {user?.name?.charAt(0) || 'U'}
            </div>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="lg:ml-[220px]">
        <div className="min-h-screen pb-20 lg:pb-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ 
                type: 'spring',
                stiffness: 380,
                damping: 30,
              }}
              className="p-4 lg:p-8"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 z-50">
        <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
          {mobileNav.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors relative",
                  active ? "text-foreground" : "text-muted-foreground"
                )}
              >
                <motion.div
                  whileTap={{ scale: 0.9 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                >
                  <Icon className={cn("h-5 w-5", active && "stroke-[2.5px]")} />
                </motion.div>
                <span className={cn("text-[11px]", active && "font-medium")}>
                  {item.label}
                </span>
                {active && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute -top-px left-1/2 -translate-x-1/2 w-8 h-0.5 bg-foreground"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
