import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, Order, MenuItem, Notification } from '../types';

interface CartItem {
  item: MenuItem;
  quantity: number;
}

interface Cart {
  diningHallId: string | null;
  diningHallName: string | null;
  items: Map<string, CartItem>;
}

interface AppState {
  // Auth
  user: User | null;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  
  // Cart (for ordering flow)
  cart: Cart;
  addToCart: (item: MenuItem, diningHallId: string, diningHallName: string) => boolean;
  removeFromCart: (itemId: string) => void;
  updateCartQuantity: (itemId: string, quantity: number) => void;
  clearCart: () => void;
  getCartTotal: () => number;
  getCartItems: () => CartItem[];
  
  // Orders (buyer)
  activeOrders: Order[];
  orderHistory: Order[];
  setActiveOrders: (orders: Order[]) => void;
  addOrder: (order: Order) => void;
  updateOrderStatus: (orderId: string, status: Order['status']) => void;
  getOrderById: (orderId: string) => Order | undefined;
  
  // Seller
  isSellerOnline: boolean;
  setSellerOnline: (online: boolean) => void;
  incomingOrders: Order[]; // Orders waiting for seller to accept
  sellerActiveOrders: Order[]; // Orders seller has accepted
  sellerOrderHistory: Order[];
  sellerEarnings: number;
  addIncomingOrder: (order: Order) => void;
  acceptOrder: (orderId: string) => void;
  declineOrder: (orderId: string) => void;
  updateSellerOrderStatus: (orderId: string, status: Order['status']) => void;
  
  // Notifications
  notifications: Notification[];
  unreadCount: number;
  addNotification: (notification: Omit<Notification, 'id' | 'createdAt'>) => void;
  markNotificationRead: (notificationId: string) => void;
  markAllNotificationsRead: () => void;
  
  // UI
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

// Helper to serialize/deserialize Map for persistence
const serializeCart = (cart: Cart) => ({
  diningHallId: cart.diningHallId,
  diningHallName: cart.diningHallName,
  items: Array.from(cart.items.entries()),
});

const deserializeCart = (data: ReturnType<typeof serializeCart>): Cart => ({
  diningHallId: data.diningHallId,
  diningHallName: data.diningHallName,
  items: new Map(data.items),
});

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Auth
      user: null,
      isAuthenticated: false,
      setUser: (user) => set({ user, isAuthenticated: !!user }),
      
      // Cart
      cart: {
        diningHallId: null,
        diningHallName: null,
        items: new Map(),
      },
      
      addToCart: (item, diningHallId, diningHallName) => {
        const { cart } = get();
        
        // If cart has items from different dining hall, reject
        if (cart.diningHallId && cart.diningHallId !== diningHallId && cart.items.size > 0) {
          return false;
        }
        
        const newItems = new Map(cart.items);
        const existing = newItems.get(item.id);
        
        newItems.set(item.id, {
          item,
          quantity: (existing?.quantity || 0) + 1,
        });
        
        set({
          cart: {
            diningHallId,
            diningHallName,
            items: newItems,
          },
        });
        
        return true;
      },
      
      removeFromCart: (itemId) => {
        const { cart } = get();
        const newItems = new Map(cart.items);
        const existing = newItems.get(itemId);
        
        if (!existing) return;
        
        if (existing.quantity <= 1) {
          newItems.delete(itemId);
        } else {
          newItems.set(itemId, {
            ...existing,
            quantity: existing.quantity - 1,
          });
        }
        
        const newDiningHallId = newItems.size > 0 ? cart.diningHallId : null;
        const newDiningHallName = newItems.size > 0 ? cart.diningHallName : null;
        
        set({
          cart: {
            diningHallId: newDiningHallId,
            diningHallName: newDiningHallName,
            items: newItems,
          },
        });
      },
      
      updateCartQuantity: (itemId, quantity) => {
        const { cart } = get();
        const newItems = new Map(cart.items);
        const existing = newItems.get(itemId);
        
        if (!existing) return;
        
        if (quantity <= 0) {
          newItems.delete(itemId);
        } else {
          newItems.set(itemId, {
            ...existing,
            quantity,
          });
        }
        
        const newDiningHallId = newItems.size > 0 ? cart.diningHallId : null;
        const newDiningHallName = newItems.size > 0 ? cart.diningHallName : null;
        
        set({
          cart: {
            diningHallId: newDiningHallId,
            diningHallName: newDiningHallName,
            items: newItems,
          },
        });
      },
      
      clearCart: () => set({
        cart: {
          diningHallId: null,
          diningHallName: null,
          items: new Map(),
        },
      }),
      
      getCartTotal: () => {
        const { cart } = get();
        let total = 0;
        cart.items.forEach(({ quantity }) => {
          total += quantity;
        });
        return total;
      },
      
      getCartItems: () => {
        const { cart } = get();
        return Array.from(cart.items.values());
      },
      
      // Orders (buyer)
      activeOrders: [],
      orderHistory: [],
      setActiveOrders: (orders) => set({ activeOrders: orders }),
      
      addOrder: (order) => {
        const { activeOrders } = get();
        set({ activeOrders: [order, ...activeOrders] });
      },
      
      updateOrderStatus: (orderId, status) => {
        const { activeOrders, orderHistory } = get();
        const orderIndex = activeOrders.findIndex(o => o.id === orderId);
        
        if (orderIndex === -1) return;
        
        const order = { ...activeOrders[orderIndex], status };
        const newActiveOrders = [...activeOrders];
        
        if (status === 'completed' || status === 'cancelled') {
          newActiveOrders.splice(orderIndex, 1);
          set({
            activeOrders: newActiveOrders,
            orderHistory: [order, ...orderHistory],
          });
        } else {
          newActiveOrders[orderIndex] = order;
          set({ activeOrders: newActiveOrders });
        }
      },
      
      getOrderById: (orderId) => {
        const { activeOrders, orderHistory } = get();
        return activeOrders.find(o => o.id === orderId) || orderHistory.find(o => o.id === orderId);
      },
      
      // Seller
      isSellerOnline: false,
      setSellerOnline: (online) => set({ isSellerOnline: online }),
      
      incomingOrders: [],
      sellerActiveOrders: [],
      sellerOrderHistory: [],
      sellerEarnings: 0,
      
      addIncomingOrder: (order) => {
        const { incomingOrders, addNotification } = get();
        set({ incomingOrders: [order, ...incomingOrders] });
        
        // Add notification
        addNotification({
          userId: 'seller',
          type: 'order_request',
          title: 'New Order Request',
          message: `${order.items.map(i => i.menuItemName).join(', ')} at ${order.diningHall}`,
          orderId: order.id,
          read: false,
        });
      },
      
      acceptOrder: (orderId) => {
        const { incomingOrders, sellerActiveOrders, user, activeOrders, addNotification } = get();
        const orderIndex = incomingOrders.findIndex(o => o.id === orderId);
        
        if (orderIndex === -1) return;
        
        const order = { 
          ...incomingOrders[orderIndex], 
          status: 'accepted' as const,
          sellerId: user?.id,
          acceptedAt: new Date(),
        };
        
        const newIncoming = [...incomingOrders];
        newIncoming.splice(orderIndex, 1);
        
        // Also update buyer's view
        const buyerOrderIndex = activeOrders.findIndex(o => o.id === orderId);
        const newActiveOrders = [...activeOrders];
        if (buyerOrderIndex !== -1) {
          newActiveOrders[buyerOrderIndex] = order;
        }
        
        set({ 
          incomingOrders: newIncoming,
          sellerActiveOrders: [order, ...sellerActiveOrders],
          activeOrders: newActiveOrders,
        });
        
        // Notify buyer
        addNotification({
          userId: order.buyerId,
          type: 'order_accepted',
          title: 'Order Accepted!',
          message: `A seller is getting your food from ${order.diningHall}`,
          orderId: order.id,
          read: false,
        });
      },
      
      declineOrder: (orderId) => {
        const { incomingOrders } = get();
        set({ 
          incomingOrders: incomingOrders.filter(o => o.id !== orderId) 
        });
      },
      
      updateSellerOrderStatus: (orderId, status) => {
        const { sellerActiveOrders, sellerOrderHistory, sellerEarnings, activeOrders, addNotification } = get();
        const orderIndex = sellerActiveOrders.findIndex(o => o.id === orderId);
        
        if (orderIndex === -1) return;
        
        const order = { ...sellerActiveOrders[orderIndex], status };
        const newSellerActive = [...sellerActiveOrders];
        
        // Update buyer's view too
        const buyerOrderIndex = activeOrders.findIndex(o => o.id === orderId);
        const newActiveOrders = [...activeOrders];
        if (buyerOrderIndex !== -1) {
          newActiveOrders[buyerOrderIndex] = order;
        }
        
        if (status === 'completed') {
          newSellerActive.splice(orderIndex, 1);
          set({
            sellerActiveOrders: newSellerActive,
            sellerOrderHistory: [{ ...order, completedAt: new Date() }, ...sellerOrderHistory],
            sellerEarnings: sellerEarnings + (order.sellerPayout / 100),
            activeOrders: newActiveOrders,
          });
          
          addNotification({
            userId: 'seller',
            type: 'order_completed',
            title: 'Order Complete!',
            message: `You earned $${(order.sellerPayout / 100).toFixed(2)}`,
            orderId: order.id,
            read: false,
          });
        } else if (status === 'cancelled') {
          newSellerActive.splice(orderIndex, 1);
          set({
            sellerActiveOrders: newSellerActive,
            sellerOrderHistory: [order, ...sellerOrderHistory],
            activeOrders: newActiveOrders,
          });
        } else {
          newSellerActive[orderIndex] = order;
          set({ 
            sellerActiveOrders: newSellerActive,
            activeOrders: newActiveOrders,
          });
          
          if (status === 'ready') {
            addNotification({
              userId: order.buyerId,
              type: 'order_ready',
              title: 'Order Ready!',
              message: `Your food is ready at ${order.diningHall}`,
              orderId: order.id,
              read: false,
            });
          }
        }
      },
      
      // Notifications
      notifications: [],
      unreadCount: 0,
      
      addNotification: (notification) => {
        const { notifications, unreadCount } = get();
        const newNotification: Notification = {
          ...notification,
          id: `notif_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          createdAt: new Date(),
        };
        set({ 
          notifications: [newNotification, ...notifications],
          unreadCount: unreadCount + 1,
        });
      },
      
      markNotificationRead: (notificationId) => {
        const { notifications, unreadCount } = get();
        const notif = notifications.find(n => n.id === notificationId);
        if (notif && !notif.read) {
          set({
            notifications: notifications.map(n => 
              n.id === notificationId ? { ...n, read: true } : n
            ),
            unreadCount: Math.max(0, unreadCount - 1),
          });
        }
      },
      
      markAllNotificationsRead: () => {
        const { notifications } = get();
        set({
          notifications: notifications.map(n => ({ ...n, read: true })),
          unreadCount: 0,
        });
      },
      
      // UI
      isLoading: false,
      setIsLoading: (loading) => set({ isLoading: loading }),
    }),
    {
      name: 'swipeswap-storage',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        cart: serializeCart(state.cart),
        activeOrders: state.activeOrders,
        orderHistory: state.orderHistory,
        isSellerOnline: state.isSellerOnline,
        sellerActiveOrders: state.sellerActiveOrders,
        sellerOrderHistory: state.sellerOrderHistory,
        sellerEarnings: state.sellerEarnings,
        notifications: state.notifications,
        unreadCount: state.unreadCount,
      }),
      merge: (persisted, current) => {
        const persistedState = persisted as Partial<AppState> & { cart?: ReturnType<typeof serializeCart> };
        return {
          ...current,
          ...persistedState,
          cart: persistedState.cart ? deserializeCart(persistedState.cart) : current.cart,
        };
      },
    }
  )
);

// Order simulation - simulates order lifecycle
export const simulateOrderProgress = (orderId: string, store: AppState) => {
  // Simulate seller accepting after 3-8 seconds
  setTimeout(() => {
    const order = store.getOrderById(orderId);
    if (order && order.status === 'pending') {
      store.updateOrderStatus(orderId, 'accepted');
      
      // Simulate preparing after 5-10 seconds
      setTimeout(() => {
        const updatedOrder = store.getOrderById(orderId);
        if (updatedOrder && updatedOrder.status === 'accepted') {
          store.updateOrderStatus(orderId, 'preparing');
          
          // Simulate ready after 8-15 seconds
          setTimeout(() => {
            const finalOrder = store.getOrderById(orderId);
            if (finalOrder && finalOrder.status === 'preparing') {
              store.updateOrderStatus(orderId, 'ready');
            }
          }, 8000 + Math.random() * 7000);
        }
      }, 5000 + Math.random() * 5000);
    }
  }, 3000 + Math.random() * 5000);
};
