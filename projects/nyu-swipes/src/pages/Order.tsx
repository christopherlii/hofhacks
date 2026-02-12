import { useState, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Clock, Plus, Minus, ShoppingCart, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@/store';
import { diningHalls, getMenuByDiningHall } from '@/lib/mockData';
import { BUYER_PRICE } from '@/lib/stripe';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import type { MenuItem } from '@/types';

export function OrderPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const hallId = searchParams.get('hall');
  
  const [selectedHall, setSelectedHall] = useState(hallId || '');
  const [searchQuery, setSearchQuery] = useState('');
  
  const cart = useStore((state) => state.cart);
  const addToCart = useStore((state) => state.addToCart);
  const removeFromCart = useStore((state) => state.removeFromCart);
  const getCartTotal = useStore((state) => state.getCartTotal);
  const clearCart = useStore((state) => state.clearCart);
  
  const hall = diningHalls.find(h => h.id === selectedHall);
  const menuItems = selectedHall ? getMenuByDiningHall(selectedHall) : [];
  
  const filteredMenuItems = useMemo(() => {
    if (!searchQuery) return menuItems;
    const query = searchQuery.toLowerCase();
    return menuItems.filter(item => 
      item.name.toLowerCase().includes(query) || 
      item.description.toLowerCase().includes(query)
    );
  }, [menuItems, searchQuery]);

  const categories = useMemo(() => {
    const cats = new Set(filteredMenuItems.map(item => item.category));
    return Array.from(cats);
  }, [filteredMenuItems]);

  const cartTotal = getCartTotal();

  const handleAddToCart = (item: MenuItem) => {
    const hallData = diningHalls.find(h => h.id === selectedHall);
    if (!hallData) return;
    
    if (cart.diningHallId && cart.diningHallId !== selectedHall) {
      clearCart();
    }
    
    addToCart(item, selectedHall, hallData.name);
  };

  const getItemQuantity = (itemId: string) => {
    return cart.items.get(itemId)?.quantity || 0;
  };

  // Dining Hall Selection
  if (!selectedHall) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <motion.h1 
          className="text-2xl font-semibold tracking-tight"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          Choose a dining hall
        </motion.h1>

        <motion.div 
          className="grid gap-4 sm:grid-cols-2"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          {diningHalls.map((dh, index) => (
            <motion.div
              key={dh.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * index }}
              whileTap={{ scale: 0.98 }}
            >
              <Card 
                className="cursor-pointer hover:bg-muted/50 transition-colors overflow-hidden"
                onClick={() => setSelectedHall(dh.id)}
              >
                <div className="aspect-[16/9] relative">
                  <img 
                    src={dh.image} 
                    alt={dh.name}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-3 right-3">
                    {dh.isOpen !== false ? (
                      <Badge className="bg-green-600">Open</Badge>
                    ) : (
                      <Badge variant="secondary">Closed</Badge>
                    )}
                  </div>
                </div>
                <CardContent className="p-4">
                  <p className="font-medium">{dh.name}</p>
                  <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" />
                      {dh.location}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-1 text-sm text-muted-foreground">
                    <Clock className="w-3.5 h-3.5" />
                    {dh.hours}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </div>
    );
  }

  // Menu View
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => setSelectedHall('')}
          className="p-2 -ml-2 hover:bg-muted rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </motion.button>
        <div>
          <h1 className="text-xl font-semibold">{hall?.name}</h1>
          <p className="text-sm text-muted-foreground">{hall?.location}</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search menu..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Menu */}
      <div className="space-y-6 pb-24">
        {categories.map((category) => (
          <div key={category}>
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
              {category}
            </h2>
            <div className="space-y-2">
              {filteredMenuItems
                .filter(item => item.category === category)
                .map((item) => {
                  const quantity = getItemQuantity(item.id);
                  return (
                    <motion.div
                      key={item.id}
                      whileTap={{ scale: 0.98 }}
                    >
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium">{item.name}</p>
                              <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
                                {item.description}
                              </p>
                              <p className="text-sm font-medium mt-2">
                                ${(BUYER_PRICE / 100).toFixed(2)}
                              </p>
                            </div>
                            
                            {quantity === 0 ? (
                              <motion.div whileTap={{ scale: 0.9 }}>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleAddToCart(item)}
                                  className="h-9 w-9 p-0"
                                >
                                  <Plus className="w-4 h-4" />
                                </Button>
                              </motion.div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <motion.div whileTap={{ scale: 0.9 }}>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => removeFromCart(item.id)}
                                    className="h-9 w-9 p-0"
                                  >
                                    <Minus className="w-4 h-4" />
                                  </Button>
                                </motion.div>
                                <span className="w-6 text-center font-medium">{quantity}</span>
                                <motion.div whileTap={{ scale: 0.9 }}>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleAddToCart(item)}
                                    className="h-9 w-9 p-0"
                                  >
                                    <Plus className="w-4 h-4" />
                                  </Button>
                                </motion.div>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
            </div>
          </div>
        ))}
      </div>

      {/* Floating Cart Button */}
      <AnimatePresence>
        {cartTotal > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="fixed bottom-20 left-4 right-4 z-30 lg:bottom-8 lg:ml-[220px] lg:left-8 lg:right-8 max-w-2xl mx-auto"
          >
            <motion.div whileTap={{ scale: 0.98 }}>
              <Button 
                className="w-full h-14 bg-violet-600 hover:bg-violet-700 text-base"
                onClick={() => navigate('/checkout')}
              >
                <ShoppingCart className="w-5 h-5 mr-2" />
                View Cart · {cartTotal} item{cartTotal !== 1 ? 's' : ''}
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
