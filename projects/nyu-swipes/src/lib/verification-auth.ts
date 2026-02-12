// Email and phone verification system
// All users must verify both NYU email and phone number

export interface VerificationState {
  email: {
    address: string;
    verified: boolean;
    verificationCode?: string;
    codeSentAt?: Date;
    verifiedAt?: Date;
  };
  phone: {
    number: string;
    verified: boolean;
    verificationCode?: string;
    codeSentAt?: Date;
    verifiedAt?: Date;
  };
}

// Verification code settings
export const VERIFICATION_CODE_LENGTH = 6;
export const VERIFICATION_CODE_EXPIRY_MINUTES = 10;

// Generate a random 6-digit code
export const generateVerificationCode = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Check if code is expired
export const isCodeExpired = (sentAt: Date): boolean => {
  const now = new Date();
  const diffMinutes = (now.getTime() - sentAt.getTime()) / (1000 * 60);
  return diffMinutes > VERIFICATION_CODE_EXPIRY_MINUTES;
};

// Email verification - NYU emails only
export const sendEmailVerification = async (email: string): Promise<{
  success: boolean;
  error?: string;
}> => {
  // Validate NYU email
  if (!email.endsWith('@nyu.edu')) {
    return { success: false, error: 'Only @nyu.edu email addresses are allowed' };
  }

  const code = generateVerificationCode();

  // In production, this would:
  // 1. Store the code in database with timestamp
  // 2. Send email via SendGrid/SES/etc
  // For now, log it
  console.log(`[EMAIL VERIFICATION] Sending code ${code} to ${email}`);

  // Simulate email send
  // In production: await sendEmail({ to: email, subject: 'Verify your SwipeSwap account', body: `Your code is: ${code}` });

  return { success: true };
};

// Verify email code
export const verifyEmailCode = async (_email: string,

  code: string,
  storedCode: string,
  codeSentAt: Date
): Promise<{ success: boolean; error?: string }> => {
  if (isCodeExpired(codeSentAt)) {
    return { success: false, error: 'Verification code has expired. Please request a new one.' };
  }

  if (code !== storedCode) {
    return { success: false, error: 'Invalid verification code' };
  }

  return { success: true };
};

// Phone verification via Twilio
export const sendPhoneVerification = async (phone: string): Promise<{
  success: boolean;
  error?: string;
}> => {
  // Validate phone format (basic US phone check)
  const cleanPhone = phone.replace(/\D/g, '');
  if (cleanPhone.length !== 10 && cleanPhone.length !== 11) {
    return { success: false, error: 'Please enter a valid US phone number' };
  }

  const code = generateVerificationCode();

  // In production, this would use Twilio Verify API or send SMS
  // await twilioClient.verify.v2.services(VERIFY_SERVICE_SID).verifications.create({
  //   to: phone,
  //   channel: 'sms'
  // });

  console.log(`[PHONE VERIFICATION] Sending code ${code} to ${phone}`);

  // Stub for Twilio SMS
  // In production:
  // await sendSMS({ to: phone, body: `Your SwipeSwap verification code is: ${code}` });

  return { success: true };
};

// Verify phone code
export const verifyPhoneCode = async (_phone: string,

  code: string,
  storedCode: string,
  codeSentAt: Date
): Promise<{ success: boolean; error?: string }> => {
  if (isCodeExpired(codeSentAt)) {
    return { success: false, error: 'Verification code has expired. Please request a new one.' };
  }

  if (code !== storedCode) {
    return { success: false, error: 'Invalid verification code' };
  }

  return { success: true };
};

// Check if user is fully verified
export const isFullyVerified = (state: VerificationState): boolean => {
  return state.email.verified && state.phone.verified;
};

// Format phone for display (XXX) XXX-XXXX
export const formatPhoneDisplay = (phone: string): string => {
  const clean = phone.replace(/\D/g, '');
  if (clean.length === 10) {
    return `(${clean.slice(0, 3)}) ${clean.slice(3, 6)}-${clean.slice(6)}`;
  }
  if (clean.length === 11 && clean.startsWith('1')) {
    return `(${clean.slice(1, 4)}) ${clean.slice(4, 7)}-${clean.slice(7)}`;
  }
  return phone;
};

// Format phone for Twilio (+1XXXXXXXXXX)
export const formatPhoneTwilio = (phone: string): string => {
  const clean = phone.replace(/\D/g, '');
  if (clean.length === 10) {
    return `+1${clean}`;
  }
  if (clean.length === 11 && clean.startsWith('1')) {
    return `+${clean}`;
  }
  return phone;
};
