// Twilio SMS service - would be called from backend in production
// These are stub functions that show the intended SMS functionality

export interface SMSMessage {
  to: string;
  body: string;
}

// Stub for sending SMS - in production this calls your backend
export const sendSMS = async (message: SMSMessage): Promise<{ success: boolean; messageId?: string }> => {
  console.log(`[SMS STUB] Sending to ${message.to}: ${message.body}`);
  
  // In production, this would call your backend API which uses Twilio
  // Example: await fetch('/api/sms/send', { method: 'POST', body: JSON.stringify(message) });
  
  return { success: true, messageId: `mock_${Date.now()}` };
};

// SMS Templates
export const smsTemplates = {
  newOrderForSeller: (order: { id: string; items: string; diningHall: string; buyerName: string }) => ({
    body: `🍔 New SwipeSwap Order!\n\nItems: ${order.items}\nPickup: ${order.diningHall}\nBuyer: ${order.buyerName}\n\nReply YES to accept or NO to decline.\n\nOrder #${order.id.slice(-6)}`,
  }),

  orderAccepted: (order: { sellerName: string; diningHall: string; estimatedTime: string }) => ({
    body: `✅ Order Accepted!\n\n${order.sellerName} is getting your food at ${order.diningHall}.\n\nEstimated ready: ${order.estimatedTime}\n\nWe'll text you when it's ready for pickup!`,
  }),

  orderReady: (order: { diningHall: string; pickupSpot: string; sellerName: string }) => ({
    body: `🎉 Your order is ready!\n\nPickup at: ${order.diningHall}\nSpot: ${order.pickupSpot}\nLook for: ${order.sellerName}\n\nPlease pick up within 10 minutes.`,
  }),

  orderCompleted: (seller: { earnings: string }) => ({
    body: `💰 Order complete! $${seller.earnings} has been added to your balance.\n\nThanks for swapping!`,
  }),

  orderCancelled: (reason: string) => ({
    body: `❌ Order cancelled: ${reason}\n\nYou have not been charged.`,
  }),

  strikeWarning: (strikes: number, reason: string) => ({
    body: `⚠️ Warning: You've received a strike.\n\nReason: ${reason}\nTotal strikes: ${strikes}/3\n\n3 strikes = account ban.`,
  }),
};

// Parse incoming SMS responses
export const parseIncomingSMS = (body: string): 'accept' | 'decline' | 'unknown' => {
  const normalized = body.toLowerCase().trim();
  
  if (['yes', 'y', 'accept', 'ok', 'sure'].includes(normalized)) {
    return 'accept';
  }
  
  if (['no', 'n', 'decline', 'pass', 'skip'].includes(normalized)) {
    return 'decline';
  }
  
  return 'unknown';
};
