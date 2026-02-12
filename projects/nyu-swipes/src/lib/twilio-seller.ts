// Seller SMS/MMS flow
// Sellers interact ONLY via iMessage/SMS after signup
// They never need to open the app again

import { sendSMS, parseIncomingSMS } from './twilio';
import { VERIFICATION_TIME_LIMIT_MINUTES } from './verification';

// Order states for SMS conversation
export type SellerOrderState = 
  | 'awaiting_response'  // Waiting for YES/NO
  | 'accepted'           // Seller accepted, heading to dining hall
  | 'awaiting_photo'     // Waiting for verification photo
  | 'photo_received'     // Photo received, order ready
  | 'completed'          // Buyer picked up
  | 'expired'            // Timed out
  | 'declined';          // Seller said no

// Track active seller conversations
export interface SellerConversation {
  orderId: string;
  sellerPhone: string;
  state: SellerOrderState;
  orderDetails: {
    items: string;
    diningHall: string;
    buyerName: string;
    pickupSpot: string;
  };
  acceptedAt?: Date;
  photoDeadline?: Date;
  photoUrl?: string;
}

// In-memory store (would be Redis/DB in production)
const activeConversations = new Map<string, SellerConversation>();

// Send new order to seller
export const sendOrderToSeller = async (
  sellerPhone: string,
  orderId: string,
  orderDetails: SellerConversation['orderDetails']
): Promise<void> => {
  const message = `🍔 NEW ORDER REQUEST

Items: ${orderDetails.items}
Pickup: ${orderDetails.diningHall}
Spot: ${orderDetails.pickupSpot}

You'll earn $5.00 for this order.

Reply YES to accept or NO to pass.

Order #${orderId.slice(-6)}`;

  await sendSMS({ to: sellerPhone, body: message });

  // Track conversation
  activeConversations.set(sellerPhone, {
    orderId,
    sellerPhone,
    state: 'awaiting_response',
    orderDetails,
  });

  // Set timeout for response (2 minutes)
  setTimeout(() => {
    const conv = activeConversations.get(sellerPhone);
    if (conv && conv.orderId === orderId && conv.state === 'awaiting_response') {
      conv.state = 'expired';
      sendSMS({ 
        to: sellerPhone, 
        body: `⏰ Order #${orderId.slice(-6)} expired. No worries - another one will come!` 
      });
    }
  }, 2 * 60 * 1000);
};

// Handle incoming SMS from seller
export const handleSellerSMS = async (
  sellerPhone: string,
  messageBody: string,
  mediaUrl?: string // MMS photo URL from Twilio
): Promise<{ response: string; action?: string }> => {
  const conv = activeConversations.get(sellerPhone);

  if (!conv) {
    return {
      response: "You don't have any active orders right now. We'll text you when one comes in!",
    };
  }


  // State machine for seller conversation
  switch (conv.state) {
    case 'awaiting_response': {
      const intent = parseIncomingSMS(messageBody);
      
      if (intent === 'accept') {
        conv.state = 'accepted';
        conv.acceptedAt = new Date();
        
        return {
          response: `✅ Order accepted!

Head to ${conv.orderDetails.diningHall} now.

When you have the food, send a photo of it and we'll notify the buyer.

You have ${VERIFICATION_TIME_LIMIT_MINUTES} minutes.`,
          action: 'order_accepted',
        };
      } else if (intent === 'decline') {
        conv.state = 'declined';
        activeConversations.delete(sellerPhone);
        
        return {
          response: `No problem! We'll find another seller. You'll get the next order.`,
          action: 'order_declined',
        };
      } else {
        return {
          response: `Reply YES to accept the order or NO to pass.`,
        };
      }
    }

    case 'accepted': {
      // Seller should be sending a photo
      if (mediaUrl) {
        // Check if within time limit
        const now = new Date();
        const acceptedAt = conv.acceptedAt!;
        const minutesElapsed = (now.getTime() - acceptedAt.getTime()) / (1000 * 60);

        if (minutesElapsed > VERIFICATION_TIME_LIMIT_MINUTES) {
          conv.state = 'expired';
          activeConversations.delete(sellerPhone);
          
          return {
            response: `⏰ Time's up! The ${VERIFICATION_TIME_LIMIT_MINUTES}-minute window has passed. 

The order has been reassigned. Please be quicker next time to avoid strikes.`,
            action: 'order_expired',
          };
        }

        // Photo received in time
        conv.state = 'photo_received';
        conv.photoUrl = mediaUrl;

        return {
          response: `📸 Photo received!

We've notified the buyer that their order is ready.

Pickup spot: ${conv.orderDetails.pickupSpot}

Wait for them there. We'll text you when they confirm pickup.

💰 $5.00 incoming!`,
          action: 'photo_received',
        };
      } else {
        // Text without photo
        return {
          response: `📷 Please send a PHOTO of the food to confirm the order is ready.

Just snap a pic and send it here.`,
        };
      }
    }

    case 'photo_received': {
      return {
        response: `Your order is marked as ready. Wait for the buyer at ${conv.orderDetails.pickupSpot}.

We'll text you when they pick up!`,
      };
    }

    case 'completed': {
      activeConversations.delete(sellerPhone);
      return {
        response: `This order is complete. Thanks for swapping! 💰`,
      };
    }

    default:
      return {
        response: `Something went wrong. Text HELP if you need assistance.`,
      };
  }
};

// Notify seller that buyer picked up
export const notifySellerOrderComplete = async (
  sellerPhone: string
): Promise<void> => {
  const conv = activeConversations.get(sellerPhone);
  
  if (conv) {
    conv.state = 'completed';
    activeConversations.delete(sellerPhone);
  }

  await sendSMS({
    to: sellerPhone,
    body: `✅ Order complete!

$5.00 has been added to your balance.

Thanks for swapping! 🎉`,
  });
};

// Get active conversation for a seller
export const getSellerConversation = (
  sellerPhone: string
): SellerConversation | undefined => {
  return activeConversations.get(sellerPhone);
};

// Twilio webhook handler for incoming SMS/MMS
export const twilioWebhookHandler = async (req: {
  From: string;
  Body: string;
  MediaUrl0?: string;
}): Promise<string> => {
  const { From: sellerPhone, Body: messageBody, MediaUrl0: mediaUrl } = req;

  const result = await handleSellerSMS(sellerPhone, messageBody, mediaUrl);

  // Return TwiML response
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${result.response}</Message>
</Response>`;
};
