// Seeded referral codes - Chris manages these manually
// Each code is tied to a club or trusted individual

export interface ReferralCode {
  code: string;
  name: string; // Club or person name
  maxUses: number;
  currentUses: number;
  isActive: boolean;
  createdAt: Date;
}

// Initial seed - Chris will add more as needed
export const seededReferralCodes: ReferralCode[] = [
  {
    code: 'SWIPESWAP2026',
    name: 'Founding Members',
    maxUses: 50,
    currentUses: 0,
    isActive: true,
    createdAt: new Date('2026-02-02'),
  },
  {
    code: 'NYUTECH',
    name: 'NYU Tech Club',
    maxUses: 100,
    currentUses: 0,
    isActive: true,
    createdAt: new Date('2026-02-02'),
  },
  {
    code: 'STERN2026',
    name: 'Stern Business Club',
    maxUses: 100,
    currentUses: 0,
    isActive: true,
    createdAt: new Date('2026-02-02'),
  },
  {
    code: 'TANDON',
    name: 'Tandon Engineering',
    maxUses: 100,
    currentUses: 0,
    isActive: true,
    createdAt: new Date('2026-02-02'),
  },
  {
    code: 'FOUNDERS',
    name: 'Founders & Friends',
    maxUses: 20,
    currentUses: 0,
    isActive: true,
    createdAt: new Date('2026-02-02'),
  },
];

export const validateReferralCode = (code: string): { valid: boolean; error?: string } => {
  const normalizedCode = code.toUpperCase().trim();
  const referral = seededReferralCodes.find(r => r.code === normalizedCode);
  
  if (!referral) {
    return { valid: false, error: 'Invalid referral code' };
  }
  
  if (!referral.isActive) {
    return { valid: false, error: 'This referral code is no longer active' };
  }
  
  if (referral.currentUses >= referral.maxUses) {
    return { valid: false, error: 'This referral code has reached its limit' };
  }
  
  return { valid: true };
};

export const useReferralCode = (code: string): boolean => {
  const normalizedCode = code.toUpperCase().trim();
  const referral = seededReferralCodes.find(r => r.code === normalizedCode);
  
  if (referral && referral.isActive && referral.currentUses < referral.maxUses) {
    referral.currentUses += 1;
    return true;
  }
  
  return false;
};
