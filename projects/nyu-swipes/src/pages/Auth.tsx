import { useState } from 'react';
import { Mail, Phone, Shield, ArrowRight, ArrowLeft, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useStore } from '@/store';
import { mockUser } from '@/lib/mockData';

type AuthStep = 
  | 'welcome'
  | 'signin'
  | 'signup_info'
  | 'signup_referral'
  | 'verify_email'
  | 'verify_phone';

export function AuthPage() {
  const [step, setStep] = useState<AuthStep>('welcome');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  
  const [emailCodeSent, setEmailCodeSent] = useState(false);
  const [phoneCodeSent, setPhoneCodeSent] = useState(false);
  
  const setUser = useStore((state) => state.setUser);

  const validateEmail = (email: string) => email.endsWith('@nyu.edu');

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!validateEmail(email)) {
      setError('Only @nyu.edu email addresses are allowed');
      return;
    }

    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    setUser({
      ...mockUser,
      email,
      name: email.split('@')[0],
    });
    
    setIsLoading(false);
  };

  const handleSignUpInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!validateEmail(email)) {
      setError('Only @nyu.edu email addresses are allowed');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (!phone || phone.length < 10) {
      setError('Please enter a valid phone number');
      return;
    }

    setStep('signup_referral');
  };

  const handleReferralSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const validCodes = ['SWIPE2026', 'NYUTEST', 'DEMO', 'TEST', referralCode.toUpperCase()];
    if (!validCodes.includes(referralCode.toUpperCase()) && referralCode.length < 4) {
      setError('Invalid referral code');
      return;
    }

    setStep('verify_email');
  };

  const handleSendEmailCode = async () => {
    setIsLoading(true);
    setError('');
    await new Promise(resolve => setTimeout(resolve, 1000));
    setEmailCodeSent(true);
    setIsLoading(false);
  };

  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (emailCode.length !== 6) {
      setError('Please enter the 6-digit code');
      return;
    }

    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 500));
    setIsLoading(false);
    setStep('verify_phone');
  };

  const handleSendPhoneCode = async () => {
    setIsLoading(true);
    setError('');
    await new Promise(resolve => setTimeout(resolve, 1000));
    setPhoneCodeSent(true);
    setIsLoading(false);
  };

  const handleVerifyPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (phoneCode.length !== 6) {
      setError('Please enter the 6-digit code');
      return;
    }

    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 500));
    
    setUser({
      ...mockUser,
      email,
      name,
      phone,
      referredBy: referralCode,
    });
    
    setIsLoading(false);
  };

  const formatPhoneDisplay = (phone: string) => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    return phone;
  };

  const getProgress = () => {
    switch (step) {
      case 'signup_info': return 1;
      case 'signup_referral': return 2;
      case 'verify_email': return 3;
      case 'verify_phone': return 4;
      default: return 0;
    }
  };

  const progress = getProgress();

  // Welcome Screen
  if (step === 'welcome') {
    return (
      <div className="min-h-screen bg-violet-950 flex">
        <div className="hidden lg:flex lg:w-1/2 flex-col justify-center items-center p-16 bg-violet-950">
          <div className="w-full max-w-lg">
            <img 
              src="/images/wsp-isometric.jpg" 
              alt="Washington Square Park" 
              className="w-full h-auto"
            />
          </div>
          <div className="mt-10 text-center">
            <h2 className="text-3xl font-semibold text-white">Washington Square</h2>
            <p className="text-white/60 mt-2">Your campus, your swipes, your way</p>
          </div>
        </div>

        <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-background">
          <div className="w-full max-w-sm">
            <div className="flex justify-center mb-10">
              <div className="w-14 h-14 bg-primary flex items-center justify-center">
                <span className="text-primary-foreground text-xl font-bold">SS</span>
              </div>
            </div>

            <h1 className="text-3xl font-semibold text-center tracking-tight mb-2">
              SwipeSwap
            </h1>
            <p className="text-center text-muted-foreground mb-10">
              Trade meal swipes with fellow NYU students
            </p>

            <div className="space-y-3">
              <Button
                className="w-full"
                size="lg"
                onClick={() => setStep('signin')}
              >
                Sign In
              </Button>
              
              <Button
                variant="outline"
                className="w-full"
                size="lg"
                onClick={() => setStep('signup_info')}
              >
                Create Account
              </Button>
            </div>

            <Card className="mt-10 bg-muted/50">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Sparkles className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">Demo Mode</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Use any @nyu.edu email. Verification codes accept any 6 digits.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <p className="mt-8 text-center text-xs text-muted-foreground">
              NYU Students Only · Meal Plan Required
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Auth forms
  return (
    <div className="min-h-screen bg-violet-950 flex">
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-center items-center p-16 bg-violet-950">
        <div className="w-full max-w-md">
          <img 
            src="/images/wsp-isometric.jpg" 
            alt="Washington Square Park" 
            className="w-full h-auto"
          />
        </div>
        <p className="mt-10 text-white/50 text-center max-w-xs">
          Join thousands of NYU students trading swipes
        </p>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-sm">
          <button
            onClick={() => {
              if (step === 'signin') setStep('welcome');
              else if (step === 'signup_info') setStep('welcome');
              else if (step === 'signup_referral') setStep('signup_info');
              else if (step === 'verify_email') setStep('signup_referral');
              else if (step === 'verify_phone') setStep('verify_email');
            }}
            className="flex items-center text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back
          </button>

          {progress > 0 && (
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">
                  {step === 'signup_info' && 'Create account'}
                  {step === 'signup_referral' && 'Referral code'}
                  {step === 'verify_email' && 'Verify email'}
                  {step === 'verify_phone' && 'Verify phone'}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">Step {progress} of 4</p>
              </div>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4].map((s) => (
                  <div
                    key={s}
                    className={`w-8 h-1 ${s <= progress ? 'bg-primary' : 'bg-muted'}`}
                  />
                ))}
              </div>
            </div>
          )}

          {step === 'signin' && (
            <>
              <h2 className="text-2xl font-semibold tracking-tight mb-2">Welcome back</h2>
              <p className="text-muted-foreground mb-8">Sign in to your SwipeSwap account</p>

              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">NYU Email</label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="netid@nyu.edu"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Password</label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                  />
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                  {isLoading ? 'Signing in...' : 'Sign In'}
                </Button>
              </form>

              <p className="mt-8 text-center text-sm text-muted-foreground">
                Don't have an account?{' '}
                <button
                  onClick={() => { setStep('signup_info'); setError(''); }}
                  className="text-foreground font-medium hover:underline"
                >
                  Sign Up
                </button>
              </p>
            </>
          )}

          {step === 'signup_info' && (
            <form onSubmit={handleSignUpInfo} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Full Name</label>
                <Input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">NYU Email</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="netid@nyu.edu"
                  required
                />
                <p className="text-xs text-muted-foreground">Must be @nyu.edu</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Phone Number</label>
                <Input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 000-0000"
                  required
                />
                <p className="text-xs text-muted-foreground">For order updates via SMS</p>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Password</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
                <p className="text-xs text-muted-foreground">At least 8 characters</p>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" className="w-full" size="lg">
                Continue
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </form>
          )}

          {step === 'signup_referral' && (
            <>
              <Alert className="mb-6 bg-violet-50 border-violet-200 text-violet-800">
                <AlertDescription>
                  SwipeSwap is invite-only. Get a code from an existing member or use <strong>DEMO</strong> to try it out.
                </AlertDescription>
              </Alert>

              <form onSubmit={handleReferralSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Referral Code</label>
                  <Input
                    type="text"
                    value={referralCode}
                    onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                    placeholder="XXXXXX"
                    required
                  />
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <Button type="submit" className="w-full" size="lg">
                  Continue
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </form>
            </>
          )}

          {step === 'verify_email' && (
            <>
              <div className="w-14 h-14 bg-muted flex items-center justify-center mx-auto mb-6">
                <Mail className="h-7 w-7 text-muted-foreground" />
              </div>

              {!emailCodeSent ? (
                <div className="space-y-4">
                  <Card className="bg-muted/50">
                    <CardContent className="p-4 text-center">
                      <p className="text-sm text-muted-foreground">We'll send a code to:</p>
                      <p className="font-medium mt-1">{email}</p>
                    </CardContent>
                  </Card>

                  <Alert className="bg-amber-50 border-amber-200 text-amber-800">
                    <AlertDescription>
                      <strong>Demo:</strong> Click send, then enter any 6 digits
                    </AlertDescription>
                  </Alert>

                  <Button className="w-full" size="lg" onClick={handleSendEmailCode} disabled={isLoading}>
                    {isLoading ? 'Sending...' : 'Send Verification Code'}
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleVerifyEmail} className="space-y-4">
                  <Alert className="bg-green-50 border-green-200 text-green-800">
                    <AlertDescription>Code sent! (Demo: enter any 6 digits)</AlertDescription>
                  </Alert>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Verification Code</label>
                    <Input
                      type="text"
                      value={emailCode}
                      onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      maxLength={6}
                      className="text-center text-xl tracking-[0.5em] font-mono"
                      required
                    />
                  </div>

                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                    {isLoading ? 'Verifying...' : 'Verify Email'}
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>

                  <Button variant="link" className="w-full" onClick={handleSendEmailCode}>
                    Resend code
                  </Button>
                </form>
              )}
            </>
          )}

          {step === 'verify_phone' && (
            <>
              <div className="w-14 h-14 bg-muted flex items-center justify-center mx-auto mb-6">
                <Phone className="h-7 w-7 text-muted-foreground" />
              </div>

              {!phoneCodeSent ? (
                <div className="space-y-4">
                  <Card className="bg-muted/50">
                    <CardContent className="p-4 text-center">
                      <p className="text-sm text-muted-foreground">We'll text a code to:</p>
                      <p className="font-medium mt-1">{formatPhoneDisplay(phone)}</p>
                    </CardContent>
                  </Card>

                  <Alert className="bg-amber-50 border-amber-200 text-amber-800">
                    <AlertDescription>
                      <strong>Demo:</strong> Click send, then enter any 6 digits
                    </AlertDescription>
                  </Alert>

                  <Button className="w-full" size="lg" onClick={handleSendPhoneCode} disabled={isLoading}>
                    {isLoading ? 'Sending...' : 'Send Verification Code'}
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleVerifyPhone} className="space-y-4">
                  <Alert className="bg-green-50 border-green-200 text-green-800">
                    <AlertDescription>Code sent! (Demo: enter any 6 digits)</AlertDescription>
                  </Alert>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Verification Code</label>
                    <Input
                      type="text"
                      value={phoneCode}
                      onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      maxLength={6}
                      className="text-center text-xl tracking-[0.5em] font-mono"
                      required
                    />
                  </div>

                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                    <Shield className="h-4 w-4 mr-2" />
                    {isLoading ? 'Creating account...' : 'Complete Sign Up'}
                  </Button>

                  <Button variant="link" className="w-full" onClick={handleSendPhoneCode}>
                    Resend code
                  </Button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
