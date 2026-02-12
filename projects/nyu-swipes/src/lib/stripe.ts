import { loadStripe } from '@stripe/stripe-js';

const stripePublicKey = import.meta.env.VITE_STRIPE_PUBLIC_KEY || 'pk_test_your_key';

export const stripePromise = loadStripe(stripePublicKey);

// Price constants
export const BUYER_PRICE = 599; // $5.99 in cents
export const SELLER_PAYOUT = 500; // $5.00 in cents
export const PLATFORM_FEE = 99; // $0.99 in cents

// Stub for creating payment intent (would be called from backend)
export const createPaymentIntent = async (_orderId: string) => {
  // In production, this calls your backend which creates a Stripe PaymentIntent
  // For now, return mock data
  return {
    clientSecret: 'mock_client_secret',
    amount: BUYER_PRICE,
  };
};

// Stub for processing seller payout
export const processSellerPayout = async (sellerId: string, amount: number) => {
  // In production, this would use Stripe Connect to pay out sellers
  console.log(`Processing payout of $${amount / 100} to seller ${sellerId}`);
  return { success: true };
};
