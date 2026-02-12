export interface User {
  id: string;
  email: string;
  name: string;
  phone: string;
  role: 'buyer' | 'seller' | 'both';
  referralCode: string;
  referredBy?: string;
  createdAt: Date;
  isVerified: boolean;
  strikes: number;
  isBanned: boolean;
}

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  diningHall: string;
  image?: string;
  available: boolean;
}

export interface DiningHall {
  id: string;
  name: string;
  location: string;
  hours: string;
  image?: string;
}

export interface Order {
  id: string;
  buyerId: string;
  sellerId?: string;
  items: OrderItem[];
  status: OrderStatus;
  diningHall: string;
  pickupLocation: string;
  totalAmount: number; // $5.99 per swipe
  sellerPayout: number; // $5.00 per swipe
  platformFee: number; // $0.99 per swipe
  createdAt: Date;
  acceptedAt?: Date;
  completedAt?: Date;
  verificationScreenshot?: string;
  notes?: string;
}

export interface OrderItem {
  menuItemId: string;
  menuItemName: string;
  quantity: number;
}

export type OrderStatus = 
  | 'pending' // Waiting for seller
  | 'accepted' // Seller accepted
  | 'preparing' // Seller at dining hall
  | 'ready' // Ready for pickup
  | 'completed' // Buyer confirmed receipt
  | 'cancelled' // Order cancelled
  | 'disputed'; // Issue reported

export interface ReferralCode {
  code: string;
  createdBy: string;
  usedBy: string[];
  maxUses: number;
  isActive: boolean;
  createdAt: Date;
}

export interface Notification {
  id: string;
  userId: string;
  type: 'order_request' | 'order_accepted' | 'order_ready' | 'order_completed' | 'strike_warning';
  title: string;
  message: string;
  orderId?: string;
  read: boolean;
  createdAt: Date;
}
