import { useNavigate } from 'react-router-dom';
import { ShoppingBag, DollarSign, ArrowRight, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { useStore } from '@/store';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export function HomePage() {
  const navigate = useNavigate();
  const user = useStore((state) => state.user);
  const cart = useStore((state) => state.cart);
  const getCartTotal = useStore((state) => state.getCartTotal);
  const sellerEarnings = useStore((state) => state.sellerEarnings);
  const cartTotal = getCartTotal();

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="max-w-2xl mx-auto lg:max-w-4xl">
      {/* Greeting */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-6"
      >
        <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight">
          {getGreeting()}, {user?.name?.split(' ')[0]}
        </h1>
        <p className="text-muted-foreground mt-1">What would you like to do?</p>
      </motion.div>

      {/* Cart Banner - only show if items in cart */}
      {cartTotal > 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="mb-6"
        >
          <Card className="bg-violet-600 text-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">
                    {cartTotal} item{cartTotal !== 1 ? 's' : ''} in cart
                  </p>
                  <p className="text-sm text-white/70">{cart.diningHallName}</p>
                </div>
                <Button 
                  variant="secondary" 
                  size="sm"
                  onClick={() => navigate('/checkout')}
                >
                  Checkout
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Main Actions - 2 column on desktop */}
      <motion.div 
        className="grid gap-4 lg:grid-cols-2"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <motion.div whileTap={{ scale: 0.98 }}>
          <Card 
            className="cursor-pointer hover:bg-muted/50 transition-colors h-full"
            onClick={() => navigate('/order')}
          >
            <CardContent className="p-5 lg:p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-violet-100 flex items-center justify-center">
                    <ShoppingBag className="w-6 h-6 text-violet-600" />
                  </div>
                  <div>
                    <p className="font-medium">Order Food</p>
                    <p className="text-sm text-muted-foreground">Get food delivered to you</p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-muted-foreground hidden lg:block" />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div whileTap={{ scale: 0.98 }}>
          <Card 
            className="cursor-pointer hover:bg-muted/50 transition-colors h-full"
            onClick={() => navigate('/sell')}
          >
            <CardContent className="p-5 lg:p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-green-100 flex items-center justify-center">
                    <DollarSign className="w-6 h-6 text-green-600" />
                  </div>
                  <div>
                    <p className="font-medium">Sell Swipes</p>
                    <p className="text-sm text-muted-foreground">Earn $5 per swipe</p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-muted-foreground hidden lg:block" />
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* Balance - only show if has earnings */}
      {sellerEarnings > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="mt-6"
        >
          <Card className="bg-green-50 border-green-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-green-800">Your balance</p>
                  <p className="text-xl font-semibold text-green-900">${sellerEarnings.toFixed(2)}</p>
                </div>
                <Button variant="outline" size="sm" className="border-green-300 text-green-700">
                  Cash out
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Referral Card - desktop only */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.25 }}
        className="mt-6 hidden lg:block"
      >
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-amber-100 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="font-medium">Invite friends, earn free meals</p>
                  <p className="text-sm text-muted-foreground">
                    Share code <span className="font-mono font-medium text-foreground">{user?.referralCode}</span> — get a free meal for every 3 signups
                  </p>
                </div>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => navigator.clipboard.writeText(user?.referralCode || '')}
              >
                Copy code
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Quick tip - mobile only */}
      <motion.p 
        className="text-center text-sm text-muted-foreground pt-6 lg:hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
      >
        Tip: Refer friends with code <span className="font-mono font-medium text-foreground">{user?.referralCode}</span>
      </motion.p>
    </div>
  );
}
