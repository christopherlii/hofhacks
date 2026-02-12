// Accountability system - strikes and bans
// Users get banned after 3 strikes

export interface Strike {
  id: string;
  userId: string;
  orderId: string;
  reason: StrikeReason;
  description: string;
  issuedAt: Date;
  issuedBy: 'system' | 'admin' | 'user_report';
  appealStatus?: 'pending' | 'approved' | 'denied';
  appealedAt?: Date;
  appealReason?: string;
}

export type StrikeReason =
  | 'no_show' // Seller accepted but never showed up
  | 'wrong_order' // Seller got the wrong items
  | 'fraud' // Fake verification photo or scam
  | 'abuse' // Abusive behavior to other users
  | 'multiple_cancellations' // Too many last-minute cancellations
  | 'slow_response'; // Consistently slow without communication

export const STRIKE_REASONS: Record<StrikeReason, { label: string; severity: number }> = {
  no_show: { label: 'No Show', severity: 2 },
  wrong_order: { label: 'Wrong Order', severity: 1 },
  fraud: { label: 'Fraudulent Activity', severity: 3 }, // Immediate ban
  abuse: { label: 'Abusive Behavior', severity: 2 },
  multiple_cancellations: { label: 'Excessive Cancellations', severity: 1 },
  slow_response: { label: 'Slow Response', severity: 1 },
};

export const MAX_STRIKES = 3;

// Calculate if user should be banned
export const shouldBanUser = (strikes: Strike[]): boolean => {
  // Fraud = immediate ban
  if (strikes.some(s => s.reason === 'fraud' && s.appealStatus !== 'approved')) {
    return true;
  }

  // Count active strikes (not successfully appealed)
  const activeStrikes = strikes.filter(s => s.appealStatus !== 'approved');
  
  // Sum severity points
  const totalSeverity = activeStrikes.reduce((sum, strike) => {
    return sum + STRIKE_REASONS[strike.reason].severity;
  }, 0);

  return totalSeverity >= MAX_STRIKES;
};

// Check if user can accept new orders
export const canAcceptOrders = (user: { strikes: number; isBanned: boolean }): boolean => {
  return !user.isBanned && user.strikes < MAX_STRIKES;
};

// Issue a strike to a user
export const issueStrike = async (
  userId: string,
  orderId: string,
  reason: StrikeReason,
  description: string,
  issuedBy: Strike['issuedBy'] = 'system'
): Promise<Strike> => {
  const strike: Strike = {
    id: `strike_${Date.now()}`,
    userId,
    orderId,
    reason,
    description,
    issuedAt: new Date(),
    issuedBy,
  };

  // In production, this would:
  // 1. Save to database
  // 2. Send SMS notification to user
  // 3. Check if user should be banned
  // 4. If banned, prevent future orders

  console.log('Strike issued:', strike);
  
  return strike;
};

// Report templates for common issues
export const reportTemplates = {
  sellerNoShow: (orderId: string) => ({
    reason: 'no_show' as StrikeReason,
    description: `Seller accepted order ${orderId} but failed to complete it`,
  }),
  
  wrongItems: (orderId: string, expected: string, received: string) => ({
    reason: 'wrong_order' as StrikeReason,
    description: `Order ${orderId}: Expected "${expected}", received "${received}"`,
  }),
  
  suspectedFraud: (orderId: string, details: string) => ({
    reason: 'fraud' as StrikeReason,
    description: `Order ${orderId}: ${details}`,
  }),
  
  buyerNoShow: (orderId: string) => ({
    reason: 'no_show' as StrikeReason,
    description: `Buyer failed to pick up order ${orderId}`,
  }),
};

// Appeal a strike
export const appealStrike = async (
  strikeId: string,
  reason: string
): Promise<{ success: boolean; message: string }> => {
  // In production, this would:
  // 1. Update strike status to 'pending'
  // 2. Notify admin for review
  // 3. Send confirmation to user

  console.log('Appeal submitted for strike:', strikeId, reason);
  
  return {
    success: true,
    message: 'Your appeal has been submitted and will be reviewed within 24 hours.',
  };
};
