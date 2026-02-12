import { useNavigate } from 'react-router-dom';
import { User, CreditCard, Bell, HelpCircle, LogOut, ChevronRight, ClipboardList } from 'lucide-react';
import { motion } from 'framer-motion';
import { useStore } from '@/store';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

export function ProfilePage() {
  const navigate = useNavigate();
  const user = useStore((state) => state.user);
  const setUser = useStore((state) => state.setUser);
  const clearCart = useStore((state) => state.clearCart);
  const sellerEarnings = useStore((state) => state.sellerEarnings);

  const handleLogout = () => {
    setUser(null);
    clearCart();
  };

  const menuItems = [
    { icon: ClipboardList, label: 'Order History', onClick: () => navigate('/orders') },
    { icon: CreditCard, label: 'Payment Methods', onClick: () => {} },
    { icon: Bell, label: 'Notifications', onClick: () => navigate('/notifications') },
    { icon: HelpCircle, label: 'Help & Support', onClick: () => {} },
  ];

  return (
    <div className="max-w-lg mx-auto space-y-6">
      {/* Profile Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4"
      >
        <div className="w-16 h-16 bg-violet-100 flex items-center justify-center">
          <User className="w-8 h-8 text-violet-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">{user?.name}</h1>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
        </div>
      </motion.div>

      {/* Balance Card */}
      {sellerEarnings > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="bg-green-50 border-green-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-green-800">Available balance</p>
                  <p className="text-2xl font-semibold text-green-900">${sellerEarnings.toFixed(2)}</p>
                </div>
                <Button variant="outline" size="sm" className="border-green-300 text-green-700">
                  Cash out
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Menu Items */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <Card>
          <div className="divide-y">
            {menuItems.map((item, index) => {
              const Icon = item.icon;
              return (
                <motion.button
                  key={item.label}
                  whileTap={{ scale: 0.98 }}
                  onClick={item.onClick}
                  className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-5 h-5 text-muted-foreground" />
                    <span className="font-medium">{item.label}</span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </motion.button>
              );
            })}
          </div>
        </Card>
      </motion.div>

      {/* Referral Code */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground mb-1">Your referral code</p>
            <div className="flex items-center justify-between">
              <p className="font-mono text-lg font-medium">{user?.referralCode}</p>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => navigator.clipboard.writeText(user?.referralCode || '')}
              >
                Copy
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Logout */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
      >
        <Button 
          variant="outline" 
          className="w-full text-red-600 border-red-200 hover:bg-red-50"
          onClick={handleLogout}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </Button>
      </motion.div>

      <p className="text-center text-xs text-muted-foreground pt-4">
        SwipeSwap v1.0.0
      </p>
    </div>
  );
}
