import { useState } from 'react';
import { MessageSquare, DollarSign, CheckCircle, Smartphone, Bell, BellOff, ArrowRight, CreditCard, Building } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useStore } from '@/store';

export function SellPage() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isRegistered, setIsRegistered] = useState(false);
  
  const user = useStore((state) => state.user);
  const sellerEarnings = useStore((state) => state.sellerEarnings);
  const sellerOrderHistory = useStore((state) => state.sellerOrderHistory);
  const isSellerOnline = useStore((state) => state.isSellerOnline);
  const setSellerOnline = useStore((state) => state.setSellerOnline);

  const hasPhone = user?.phone || isRegistered;

  const handleRegister = () => {
    if (phoneNumber.length >= 10) {
      setIsRegistered(true);
    }
  };

  // Not registered - show signup flow
  if (!hasPhone) {
    return (
      <div className="max-w-lg mx-auto space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-2xl font-semibold tracking-tight">Sell Your Swipes</h1>
          <p className="text-muted-foreground mt-1">Earn $5 every time you help a fellow student</p>
        </motion.div>

        {/* How it works */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="bg-violet-600 text-white">
            <CardContent className="p-5">
              <h3 className="font-semibold mb-3">How it works</h3>
              <ol className="space-y-3 text-sm">
                <li className="flex gap-3">
                  <span className="w-6 h-6 bg-white/20 flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
                  <span>You get a text when someone needs food</span>
                </li>
                <li className="flex gap-3">
                  <span className="w-6 h-6 bg-white/20 flex items-center justify-center text-xs font-bold flex-shrink-0">2</span>
                  <span>Place their order on Grubhub using your meal plan</span>
                </li>
                <li className="flex gap-3">
                  <span className="w-6 h-6 bg-white/20 flex items-center justify-center text-xs font-bold flex-shrink-0">3</span>
                  <span>Text back the confirmation — they pick up, you get $5</span>
                </li>
              </ol>
            </CardContent>
          </Card>
        </motion.div>

        {/* Register form */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="font-medium">Get started via SMS</p>
                  <p className="text-sm text-muted-foreground">We'll text you when orders come in</p>
                </div>
              </div>
              
              <div className="space-y-2">
                <Input
                  type="tel"
                  placeholder="Your phone number"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                />
                <Button className="w-full" onClick={handleRegister} disabled={phoneNumber.length < 10}>
                  Start Earning
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                By signing up, you agree to receive SMS notifications for orders
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  // Registered - show dashboard
  return (
    <div className="max-w-lg mx-auto space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-2xl font-semibold tracking-tight">Sell Swipes</h1>
      </motion.div>

      {/* Toggle Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card className={isSellerOnline ? 'bg-green-50 border-green-200' : ''}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 flex items-center justify-center ${isSellerOnline ? 'bg-green-100' : 'bg-muted'}`}>
                  {isSellerOnline ? (
                    <Bell className="w-5 h-5 text-green-600" />
                  ) : (
                    <BellOff className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <p className="font-medium">{isSellerOnline ? "You're online" : "You're offline"}</p>
                  <p className="text-sm text-muted-foreground">
                    {isSellerOnline 
                      ? `Receiving orders at ${user?.phone || phoneNumber}` 
                      : "You won't receive order requests"}
                  </p>
                </div>
              </div>
              <Button
                variant={isSellerOnline ? 'outline' : 'default'}
                onClick={() => setSellerOnline(!isSellerOnline)}
              >
                {isSellerOnline ? 'Go Offline' : 'Go Online'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Earnings Summary */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="grid grid-cols-2 gap-4"
      >
        <Card>
          <CardContent className="p-5 text-center">
            <DollarSign className="w-8 h-8 text-green-600 mx-auto mb-2" />
            <p className="text-2xl font-bold">${sellerEarnings.toFixed(2)}</p>
            <p className="text-sm text-muted-foreground">Total earned</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 text-center">
            <CheckCircle className="w-8 h-8 text-violet-600 mx-auto mb-2" />
            <p className="text-2xl font-bold">{sellerOrderHistory.filter(o => o.status === 'completed').length}</p>
            <p className="text-sm text-muted-foreground">Orders completed</p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Payouts Section */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Card>
          <CardContent className="p-5 space-y-4">
            <h3 className="font-medium flex items-center gap-2">
              <CreditCard className="w-4 h-4" />
              Payouts
            </h3>
            
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded">
              <div>
                <p className="text-sm text-muted-foreground">Available balance</p>
                <p className="text-xl font-bold">${sellerEarnings.toFixed(2)}</p>
              </div>
              <Button disabled={sellerEarnings === 0}>
                Cash out
              </Button>
            </div>

            <Separator />

            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <Building className="w-4 h-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="font-medium">How payouts work</p>
                  <p className="text-muted-foreground">
                    You earn $5 for each order you fulfill. Cash out anytime to your linked bank account or Venmo. Payouts typically arrive within 1-2 business days.
                  </p>
                </div>
              </div>
            </div>

            <Button variant="outline" className="w-full">
              Set up payout method
            </Button>
          </CardContent>
        </Card>
      </motion.div>

      {/* How it works */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
      >
        <Card>
          <CardContent className="p-5">
            <h3 className="font-medium mb-4 flex items-center gap-2">
              <Smartphone className="w-4 h-4" />
              When you get a text
            </h3>
            <ol className="space-y-3 text-sm">
              <li className="flex gap-3 items-start">
                <span className="w-6 h-6 bg-muted flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
                <div>
                  <p className="font-medium">Reply "Y" to accept</p>
                  <p className="text-muted-foreground">You have 2 minutes to respond</p>
                </div>
              </li>
              <li className="flex gap-3 items-start">
                <span className="w-6 h-6 bg-muted flex items-center justify-center text-xs font-bold flex-shrink-0">2</span>
                <div>
                  <p className="font-medium">Place the order on Grubhub</p>
                  <p className="text-muted-foreground">Use your NYU meal plan</p>
                </div>
              </li>
              <li className="flex gap-3 items-start">
                <span className="w-6 h-6 bg-muted flex items-center justify-center text-xs font-bold flex-shrink-0">3</span>
                <div>
                  <p className="font-medium">Send the confirmation screenshot</p>
                  <p className="text-muted-foreground">Buyer picks up, you get paid</p>
                </div>
              </li>
            </ol>
          </CardContent>
        </Card>
      </motion.div>

      {/* Recent orders */}
      {sellerOrderHistory.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <h3 className="font-medium mb-3">Recent orders</h3>
          <Card>
            <div className="divide-y">
              {sellerOrderHistory.slice(0, 5).map((order) => (
                <div key={order.id} className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium">{order.items.map(i => i.menuItemName).join(', ')}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(order.completedAt || order.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                  </div>
                  {order.status === 'completed' ? (
                    <span className="font-semibold text-green-600">+$5.00</span>
                  ) : (
                    <Badge variant="secondary">{order.status}</Badge>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
