import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, CreditCard, CheckCircle, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useStore, simulateOrderProgress } from '@/store';
import { BUYER_PRICE } from '@/lib/stripe';
import type { Order } from '@/types';

export function CheckoutPage() {
  const navigate = useNavigate();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [pickupNotes, setPickupNotes] = useState('');
  const [orderId, setOrderId] = useState('');

  const cart = useStore((state) => state.cart);
  const getCartItems = useStore((state) => state.getCartItems);
  const getCartTotal = useStore((state) => state.getCartTotal);
  const clearCart = useStore((state) => state.clearCart);
  const removeFromCart = useStore((state) => state.removeFromCart);
  const addOrder = useStore((state) => state.addOrder);
  const user = useStore((state) => state.user);

  const cartItems = getCartItems();
  const itemCount = getCartTotal();
  const total = (itemCount * BUYER_PRICE) / 100;

  const handlePayment = async () => {
    if (itemCount === 0) return;
    
    setIsProcessing(true);
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const newOrderId = `SW${Date.now().toString().slice(-8)}`;
    const order: Order = {
      id: newOrderId,
      buyerId: user?.id || 'guest',
      items: cartItems.map(({ item, quantity }) => ({
        menuItemId: item.id,
        menuItemName: item.name,
        quantity,
      })),
      status: 'pending',
      diningHall: cart.diningHallName || 'Unknown',
      pickupLocation: pickupNotes || 'Main entrance',
      totalAmount: itemCount * BUYER_PRICE,
      sellerPayout: itemCount * 500,
      platformFee: itemCount * 99,
      createdAt: new Date(),
      notes: pickupNotes,
    };
    
    addOrder(order);
    clearCart();
    simulateOrderProgress(newOrderId, useStore.getState());
    
    setOrderId(newOrderId);
    setIsProcessing(false);
    setIsComplete(true);
  };

  // Success Screen
  if (isComplete) {
    return (
      <motion.div 
        className="max-w-lg mx-auto min-h-[60vh] flex flex-col items-center justify-center text-center px-4"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      >
        <motion.div 
          className="w-20 h-20 bg-green-100 flex items-center justify-center mb-6"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.1 }}
        >
          <CheckCircle className="w-10 h-10 text-green-600" />
        </motion.div>
        <h2 className="text-2xl font-semibold mb-2">Order Placed!</h2>
        <p className="text-muted-foreground mb-6 max-w-sm">
          We're finding a seller for you. You'll get a notification when your order is accepted.
        </p>
        <div className="space-y-3 w-full max-w-xs">
          <Button className="w-full" onClick={() => navigate('/orders')}>
            Track Order
          </Button>
          <Button variant="outline" className="w-full" onClick={() => navigate('/')}>
            Back to Home
          </Button>
        </div>
      </motion.div>
    );
  }

  // Empty Cart
  if (itemCount === 0) {
    return (
      <div className="max-w-lg mx-auto min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
        <p className="text-muted-foreground mb-4">Your cart is empty</p>
        <Button onClick={() => navigate('/order')}>Browse Menu</Button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-32">
      {/* Header */}
      <div className="flex items-center gap-3">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate(-1)}
          className="p-2 -ml-2 hover:bg-muted rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </motion.button>
        <h1 className="text-xl font-semibold">Checkout</h1>
      </div>

      {/* Dining Hall */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <MapPin className="w-5 h-5 text-muted-foreground" />
            <div>
              <p className="font-medium">{cart.diningHallName}</p>
              <p className="text-sm text-muted-foreground">Pickup location</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Items */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="text-sm font-medium text-muted-foreground">Items ({itemCount})</p>
          {cartItems.map(({ item, quantity }) => (
            <div key={item.id} className="flex items-center justify-between">
              <div className="flex-1">
                <p className="font-medium">{item.name}</p>
                <p className="text-sm text-muted-foreground">
                  {quantity} × ${(BUYER_PRICE / 100).toFixed(2)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <p className="font-medium">${((quantity * BUYER_PRICE) / 100).toFixed(2)}</p>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => removeFromCart(item.id)}
                  className="p-2 text-muted-foreground hover:text-red-600 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </motion.button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardContent className="p-4">
          <label className="text-sm font-medium text-muted-foreground block mb-2">
            Pickup notes (optional)
          </label>
          <Input
            placeholder="e.g., I'm wearing a red jacket"
            value={pickupNotes}
            onChange={(e) => setPickupNotes(e.target.value)}
          />
        </CardContent>
      </Card>

      {/* Payment */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <CreditCard className="w-5 h-5 text-muted-foreground" />
            <div className="flex-1">
              <p className="font-medium">Apple Pay</p>
              <p className="text-sm text-muted-foreground">•••• 4242</p>
            </div>
            <Button variant="ghost" size="sm">Change</Button>
          </div>
        </CardContent>
      </Card>

      {/* Total */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span>${total.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Service fee</span>
            <span>$0.00</span>
          </div>
          <Separator className="my-2" />
          <div className="flex justify-between font-semibold">
            <span>Total</span>
            <span>${total.toFixed(2)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Pay Button */}
      <div className="fixed bottom-20 left-4 right-4 z-30 lg:bottom-8 lg:ml-[220px] lg:left-8 lg:right-8 max-w-lg mx-auto">
        <motion.div whileTap={{ scale: 0.98 }}>
          <Button 
            className="w-full h-14 bg-violet-600 hover:bg-violet-700 text-base"
            onClick={handlePayment}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <span className="flex items-center gap-2">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                />
                Processing...
              </span>
            ) : (
              `Pay $${total.toFixed(2)}`
            )}
          </Button>
        </motion.div>
      </div>
    </div>
  );
}
