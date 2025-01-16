import React, { useState, useEffect } from 'react';
import { X, Loader, AlertCircle, Eye, EyeOff, Lock, Mail, User, CheckCircle } from 'lucide-react';
import { supabase } from '../services/supabase';
import { motion } from 'framer-motion';
import { validatePassword, validateEmail } from '../utils/validation';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (user: any) => void;
}

export function AuthModal({ isOpen, onClose, onAuthSuccess }: AuthModalProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [lockTimer, setLockTimer] = useState(0);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [verificationSent, setVerificationSent] = useState(false);
  const [justSignedUp, setJustSignedUp] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isLocked && lockTimer > 0) {
      interval = setInterval(() => {
        setLockTimer((prev) => {
          if (prev <= 1) {
            setIsLocked(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isLocked, lockTimer]);

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setUsername('');
    setError(null);
    setSuccessMessage(null);
    setVerificationSent(false);
    setJustSignedUp(false);
  };

  const handleModalClose = () => {
    resetForm();
    onClose();
  };

  const handleResendVerification = async () => {
    try {
      setIsLoading(true);
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email,
      });
      
      if (error) {
        setError(error.message);
        return;
      }
      
      setSuccessMessage('Verification email has been resent. Please check your inbox.');
      setError(null);
    } catch (error: any) {
      console.error('Error resending verification:', error);
      setError(error.message || 'Failed to resend verification email');
    } finally {
      setIsLoading(false);
    }
  };

  const createProfile = async (userId: string, username: string) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .insert([{ id: userId, username, created_at: new Date().toISOString() }]);
      
      if (error) {
        // If the error is about the profile already existing, we can ignore it
        if (error.code === '23505' && error.message.includes('profiles_pkey')) {
          return; // Profile already exists, which is fine
        }
        throw error;
      }
    } catch (error) {
      console.error('Error creating profile:', error);
      // Don't throw the error, just log it and continue
      // This way the sign-up process won't be interrupted
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) return;

    setError(null);
    setSuccessMessage(null);
    setIsLoading(true);

    try {
      if (!validateEmail(email)) {
        setError('Please enter a valid email address');
        return;
      }

      const passwordValidation = validatePassword(password);
      if (!passwordValidation.isValid) {
        setError(passwordValidation.message);
        return;
      }

      if (isSignUp) {
        if (password !== confirmPassword) {
          setError('Passwords do not match');
          return;
        }
        if (!username.trim()) {
          setError('Username is required');
          return;
        }
        if (username.length < 3) {
          setError('Username must be at least 3 characters long');
          return;
        }

        // Check if username exists
        const { data: existingUser } = await supabase
          .from('profiles')
          .select('username')
          .eq('username', username)
          .single();

        if (existingUser) {
          setError('Username already taken');
          return;
        }

        // Sign up user
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { username },
            emailRedirectTo: `${window.location.origin}/auth/callback`
          }
        });

        if (signUpError) {
          setError(signUpError.message);
          return;
        }

        if (!signUpData.user) {
          setError('Failed to create account');
          return;
        }

        // Create profile - but don't let profile creation errors affect the signup flow
        await createProfile(signUpData.user.id, username);
        
        // Always set success message and update UI state
        setError(null);
        setJustSignedUp(true);
        setVerificationSent(true);
        setSuccessMessage('Account created successfully! Please check your email to verify your account.');
        
        // Clear form fields but keep email for convenience
        setPassword('');
        setConfirmPassword('');
        setUsername('');
        setIsSignUp(false); // Switch to sign in mode

      } else {
        if (attempts >= 4) {
          setIsLocked(true);
          setLockTimer(300); // 5 minutes
          setError('Too many failed attempts. Try again in 5 minutes.');
          return;
        }

        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) {
          setError(signInError.message);
          setAttempts(prev => prev + 1);
          return;
        }

        if (!signInData.user) {
          setError('Failed to sign in');
          setAttempts(prev => prev + 1);
          return;
        }

        // Check if email is verified
        if (!signInData.user.email_confirmed_at) {
          setVerificationSent(true);
          setError('Please verify your email address before signing in. Check your inbox for the verification link.');
          return;
        }

        if (rememberMe) {
          localStorage.setItem('rememberMe', 'true');
          localStorage.setItem('lastEmail', email);
        } else {
          localStorage.removeItem('rememberMe');
          localStorage.removeItem('lastEmail');
        }

        setAttempts(0);
        setError(null);
        setSuccessMessage('Successfully signed in!');
        onAuthSuccess(signInData.user);
        handleModalClose();
      }
    } catch (error: any) {
      console.error('Auth error:', error);
      setError(error.message || 'Authentication failed');
      if (!isSignUp) {
        setAttempts(prev => prev + 1);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Load remembered email if available
  useEffect(() => {
    if (localStorage.getItem('rememberMe') === 'true') {
      const savedEmail = localStorage.getItem('lastEmail');
      if (savedEmail) {
        setEmail(savedEmail);
        setRememberMe(true);
      }
    }
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-lg shadow-xl max-w-md w-full relative overflow-hidden"
      >
        <button
          onClick={handleModalClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6">
          <h2 className="text-2xl font-semibold text-gray-900 mb-6">
            {isSignUp ? 'Create Account' : 'Welcome Back'}
          </h2>

          {(verificationSent || justSignedUp) && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-md"
            >
              <h3 className="text-sm font-medium text-blue-800 mb-2">Verify your email</h3>
              <p className="text-sm text-blue-600 mb-3">
                We've sent a verification link to <strong>{email}</strong>. Please check your inbox and click
                the link to verify your account.
              </p>
              <button
                onClick={handleResendVerification}
                className="text-sm text-blue-800 hover:text-blue-900 font-medium"
                disabled={isLoading}
              >
                Didn't receive the email? Click here to resend
              </button>
            </motion.div>
          )}

          {error && !justSignedUp && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2 text-red-600"
            >
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm">{error}</p>
                {error.includes('verify your email') && (
                  <button
                    onClick={handleResendVerification}
                    className="mt-2 text-sm font-medium hover:text-red-800"
                    disabled={isLoading}
                  >
                    Resend verification email
                  </button>
                )}
              </div>
            </motion.div>
          )}

          {successMessage && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md flex items-center gap-2 text-green-600"
            >
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm">{successMessage}</p>
            </motion.div>
          )}

          {isLocked && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md"
            >
              <p className="text-sm text-yellow-700">
                Account locked. Try again in {Math.ceil(lockTimer / 60)} minutes.
              </p>
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700">
                  Username
                </label>
                <div className="mt-1 relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center">
                    <User className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="username"
                    type="text"
                    required
                    minLength={3}
                    value={username}
                    onChange={(e) => setUsername(e.target.value.trim())}
                    className="pl-10 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    placeholder="Choose a username"
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value.trim())}
                  className="pl-10 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  placeholder="Enter your email"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  placeholder={isSignUp ? 'Create a password' : 'Enter your password'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center focus:outline-none"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5 text-gray-400" />
                  ) : (
                    <Eye className="h-5 w-5 text-gray-400" />
                  )}
                </button>
              </div>
              {isSignUp && (
                <p className="mt-1 text-xs text-gray-500">
                  Password must be at least 8 characters long and include a number
                </p>
              )}
            </div>

            {isSignUp && (
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                  Confirm Password
                </label>
                <div className="mt-1 relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="confirmPassword"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    placeholder="Confirm your password"
                  />
                </div>
              </div>
            )}

            {!isSignUp && (
              <div className="flex items-center">
                <input
                  id="remember-me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700">
                  Remember me
                </label>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || isLocked}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
            >
              {isLoading ? (
                <Loader className="w-5 h-5 animate-spin" />
              ) : isSignUp ? (
                'Sign Up'
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="mt-4 flex items-center justify-center">
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError(null);
                setSuccessMessage(null);
                resetForm();
              }}
              className="text-sm text-blue-600 hover:text-blue-500 focus:outline-none focus:underline transition-colors duration-200"
            >
              {isSignUp ? 'Already have an account?' : "Don't have an account?"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}