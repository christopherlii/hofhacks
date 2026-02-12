import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import { OrderTracker } from '@/components/OrderTracker';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useStore } from '@/store';
import type { Order, OrderStatus } from '@/types';

const getStatusConfig = (status: OrderStatus) => {
  const config: Record<OrderStatus, { label: string; className: string }> = {
    pending: { label: 'Finding seller', className: 'bg-amber-100 text-amber-700' },
    accepted: { label: 'Accepted', className: 'bg-blue-100 text-blue-700' },
    preparing: { label: 'Preparing', className: 'bg-blue-100 text-blue-700' },
    ready: { label: 'Ready', className: 'bg-green-100 text-green-700' },
    completed: { label: 'Completed', className: 'bg-muted text-muted-foreground' },
    cancelled: { label: 'Cancelled', className: 'bg-muted text-muted-foreground' },
    disputed: { label: 'Disputed', className: 'bg-red-100 text-red-700' },
  };
  return config[status];
};

export function OrdersPage() {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  
  const activeOrders = useStore((state) => state.activeOrders);
  const orderHistory = useStore((state) => state.orderHistory);
  const updateOrderStatus = useStore((state) => state.updateOrderStatus);
  const user = useStore((state) => state.user);

  const allOrders = [...activeOrders, ...orderHistory].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const handleConfirmPickup = () => {
    if (selectedOrder) {
      updateOrderStatus(selectedOrder.id, 'completed');
      setSelectedOrder(null);
    }
  };

  const handleCancel = () => {
    if (selectedOrder) {
      updateOrderStatus(selectedOrder.id, 'cancelled');
      setSelectedOrder(null);
    }
  };

  // Order detail view
  if (selectedOrder) {
    return (
      <div className="max-w-lg mx-auto">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => setSelectedOrder(null)}
          className="flex items-center text-sm text-muted-foreground mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          Back to orders
        </motion.button>

        <div className="mb-4">
          <p className="text-sm text-muted-foreground">Order</p>
          <h1 className="text-xl font-semibold">#{selectedOrder.id.slice(-8)}</h1>
        </div>

        <OrderTracker
          order={selectedOrder}
          userRole={selectedOrder.buyerId === user?.id ? 'buyer' : 'seller'}
          onConfirmPickup={handleConfirmPickup}
          onCancel={handleCancel}
          onReportIssue={() => {}}
        />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <motion.h1 
        className="text-2xl font-semibold tracking-tight"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        My Orders
      </motion.h1>

      <Tabs defaultValue="active">
        <TabsList className="w-full">
          <TabsTrigger value="active" className="flex-1">
            Active
            {activeOrders.length > 0 && (
              <Badge className="ml-2" variant="default">{activeOrders.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="flex-1">History</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4 space-y-3">
          {activeOrders.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">No active orders</p>
              </CardContent>
            </Card>
          ) : (
            activeOrders.map((order, index) => (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                whileTap={{ scale: 0.98 }}
              >
                <Card 
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setSelectedOrder(order)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">
                          {order.items.map(i => i.menuItemName).join(', ')}
                        </p>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {order.diningHall}
                        </p>
                      </div>
                      <Badge variant="secondary" className={getStatusConfig(order.status).className}>
                        {getStatusConfig(order.status).label}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4 space-y-3">
          {orderHistory.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">No order history</p>
              </CardContent>
            </Card>
          ) : (
            orderHistory.map((order, index) => (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                whileTap={{ scale: 0.98 }}
              >
                <Card 
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setSelectedOrder(order)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">
                          {order.items.map(i => i.menuItemName).join(', ')}
                        </p>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {new Date(order.createdAt).toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric' 
                          })} · ${(order.totalAmount / 100).toFixed(2)}
                        </p>
                      </div>
                      <Badge variant="secondary" className={getStatusConfig(order.status).className}>
                        {getStatusConfig(order.status).label}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
