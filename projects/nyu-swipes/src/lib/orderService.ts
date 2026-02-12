// Order management service
// Handles the full lifecycle of an order

import type { Order, OrderItem, OrderStatus } from '../types';
import { sendSMS, smsTemplates } from './twilio';
import { BUYER_PRICE, SELLER_PAYOUT, PLATFORM_FEE } from './stripe';
import { issueStrike, reportTemplates } from './accountability';

// Timeout for seller to accept (in minutes)
export const SELLER_ACCEPT_TIMEOUT_MINUTES = 5;

// Timeout for seller to complete after accepting (in minutes)
export const SELLER_COMPLETE_TIMEOUT_MINUTES = 30;

// Create a new order
export const createOrder = async (
  buyerId: string,
  _buyerPhone: string,
  items: OrderItem[],
  diningHall: string,
  pickupNotes?: string
): Promise<Order> => {
  const order: Order = {
    id: `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    buyerId,
    items,
    status: 'pending',
    diningHall,
    pickupLocation: pickupNotes || 'Main entrance',
    totalAmount: items.length * BUYER_PRICE,
    sellerPayout: items.length * SELLER_PAYOUT,
    platformFee: items.length * PLATFORM_FEE,
    createdAt: new Date(),
    notes: pickupNotes,
  };

  // In production: Save to database
  console.log('Order created:', order);

  // Find available sellers and ping them
  await pingAvailableSellers(order);

  return order;
};

// Ping available sellers for a new order
const pingAvailableSellers = async (order: Order): Promise<void> => {
  // In production, this would:
  // 1. Query database for sellers who are:
  //    - Online/available
  //    - Not banned
  //    - Near the dining hall (optional)
  //    - Have capacity for more orders
  // 2. Send SMS to each seller
  // 3. Track who was pinged

  const mockSellerPhones = ['+1234567890']; // Would come from database
  
  for (const phone of mockSellerPhones) {
    const sms = smsTemplates.newOrderForSeller({
      id: order.id,
      items: order.items.map(i => `${i.quantity}x ${i.menuItemName}`).join(', '),
      diningHall: order.diningHall,
      buyerName: 'A buyer', // Would fetch actual name
    });

    await sendSMS({
      to: phone,
      body: sms.body,
    });
  }
};

// Seller accepts an order
export const acceptOrder = async (
  orderId: string,
  sellerId: string,
  _sellerPhone: string,
  sellerName: string,
  buyerPhone: string
): Promise<Order> => {
  // In production: Update database, verify order is still pending
  
  const updatedOrder: Partial<Order> = {
    sellerId,
    status: 'accepted',
    acceptedAt: new Date(),
  };

  // Notify buyer
  const buyerSms = smsTemplates.orderAccepted({
    sellerName,
    diningHall: 'Lipton Dining Hall', // Would come from order
    estimatedTime: '15-20 minutes',
  });

  await sendSMS({
    to: buyerPhone,
    body: buyerSms.body,
  });

  console.log('Order accepted:', orderId, 'by seller:', sellerId);
  
  return { id: orderId, ...updatedOrder } as Order;
};

// Seller marks order as ready for pickup
export const markOrderReady = async (
  orderId: string,
  _sellerId: string,
  buyerPhone: string,
  verificationPhotoUrl: string
): Promise<Order> => {
  // In production:
  // 1. Validate verification photo was taken in-app
  // 2. Check timestamp is within time limit
  // 3. Optionally verify location
  // 4. Update database

  const updatedOrder: Partial<Order> = {
    status: 'ready',
    verificationScreenshot: verificationPhotoUrl,
  };

  // Notify buyer
  const buyerSms = smsTemplates.orderReady({
    diningHall: 'Lipton Dining Hall',
    pickupSpot: 'Front entrance',
    sellerName: 'Your seller',
  });

  await sendSMS({
    to: buyerPhone,
    body: buyerSms.body,
  });

  console.log('Order ready:', orderId);
  
  return { id: orderId, ...updatedOrder } as Order;
};

// Buyer confirms receipt - completes the order
export const completeOrder = async (
  orderId: string,
  _buyerId: string,
  _sellerId: string,
  sellerPhone: string
): Promise<Order> => {
  // In production:
  // 1. Update order status
  // 2. Release payment to seller
  // 3. Update seller earnings

  const updatedOrder: Partial<Order> = {
    status: 'completed',
    completedAt: new Date(),
  };

  // Notify seller of earnings
  const sellerSms = smsTemplates.orderCompleted({
    earnings: (SELLER_PAYOUT / 100).toFixed(2),
  });

  await sendSMS({
    to: sellerPhone,
    body: sellerSms.body,
  });

  console.log('Order completed:', orderId);
  
  return { id: orderId, ...updatedOrder } as Order;
};

// Cancel an order
export const cancelOrder = async (
  orderId: string,
  cancelledBy: 'buyer' | 'seller' | 'system',
  reason: string,
  affectedUserPhone: string
): Promise<Order> => {
  const updatedOrder: Partial<Order> = {
    status: 'cancelled',
  };

  // Notify affected party
  const sms = smsTemplates.orderCancelled(reason);
  await sendSMS({
    to: affectedUserPhone,
    body: sms.body,
  });

  // Issue strike if seller cancelled without valid reason
  if (cancelledBy === 'seller') {
    // Check if this is a repeat offense
    // For now, just log it
    console.log('Seller cancelled order:', orderId, reason);
  }

  console.log('Order cancelled:', orderId, 'by:', cancelledBy);
  
  return { id: orderId, ...updatedOrder } as Order;
};

// Report an issue with an order
export const reportIssue = async (
  orderId: string,
  reportedBy: 'buyer' | 'seller',
  issueType: 'no_show' | 'wrong_order' | 'fraud' | 'other',
  description: string,
  targetUserId: string
): Promise<{ success: boolean; message: string }> => {
  // In production:
  // 1. Create dispute record
  // 2. Issue strike if warranted
  // 3. Potentially refund buyer

  console.log('Issue reported:', {
    orderId,
    reportedBy,
    issueType,
    description,
    targetUserId,
  });

  // Issue strike based on issue type
  if (issueType === 'no_show') {
    const template = reportTemplates.sellerNoShow(orderId);
    await issueStrike(targetUserId, orderId, template.reason, template.description, 'user_report');
  }

  return {
    success: true,
    message: 'Your report has been submitted. We\'ll review it and take appropriate action.',
  };
};

// Get order status for tracking
export const getOrderStatus = (status: OrderStatus): {
  label: string;
  description: string;
  color: string;
} => {
  const statuses = {
    pending: {
      label: 'Finding Seller',
      description: 'Looking for someone to fulfill your order',
      color: 'yellow',
    },
    accepted: {
      label: 'Seller Found',
      description: 'Your seller is heading to the dining hall',
      color: 'blue',
    },
    preparing: {
      label: 'Getting Food',
      description: 'Your seller is at the dining hall',
      color: 'blue',
    },
    ready: {
      label: 'Ready for Pickup',
      description: 'Your food is ready! Head to the pickup spot',
      color: 'green',
    },
    completed: {
      label: 'Completed',
      description: 'Order complete. Enjoy your meal!',
      color: 'green',
    },
    cancelled: {
      label: 'Cancelled',
      description: 'This order was cancelled',
      color: 'gray',
    },
    disputed: {
      label: 'Under Review',
      description: 'We\'re looking into a reported issue',
      color: 'red',
    },
  };

  return statuses[status];
};
