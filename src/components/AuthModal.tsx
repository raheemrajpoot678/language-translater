import React, { useState, useEffect } from 'react';
import { X, Loader, AlertCircle, Eye, EyeOff, Lock, Mail, User } from 'lucide-react';
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
  };

  const handleModalClose = () => {
    resetForm();
    onClose();
  };

  const handleAuthError = (error: any) => {
    let errorMessage = 'Authentication failed';
    
    if (error.message?.includes('Invalid login credentials')) {
      errorMessage = 'Invalid email or password';
    } else if (error.message?.includes('User already registered')) {
      errorMessage = 'An account with this email already exists';
    } else if (error.message?.includes('Password should be')) {
      errorMessage = error.message;
    } else if (error.message) {
      errorMessage = error.message;
    }

    setError(errorMessage);
    if (!isSignUp) {
      setAttempts(prev => prev + 1);
    }
  };

  const createProfile = async (userId: string, username: string) => {
    const { error } = await supabase
      .from('profiles')
      .insert([{ id: userId, username, created_at: new Date().toISOString() }]);
    
    if (error) throw error;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) return;

    setError(null);
    setSuccessMessage(null);
    setIsLoading(true);

    try {
      if (!validateEmail(email)) {
        throw new Error('Please enter a valid email address');
      }

      const passwordValidation = validatePassword(password);
      if (!passwordValidation.isValid) {
        throw new Error(passwordValidation.message);
      }

      if (isSignUp) {
        if (password !== confirmPassword) {
          throw new Error('Passwords do not match');
        }
        if (!username.trim()) {
          throw new Error('Username is required');
        }
        if (username.length < 3) {
          throw new Error('Username must be at least 3 characters long');
        }

        // Check if username exists
        const { data: existingUser } = await supabase
          .from('profiles')
          .select('username')
          .eq('username', username)
          .single();

        if (existingUser) {
          throw new Error('Username already taken');
        }

        // Sign up user
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { username }
          }
        });

        if (signUpError) throw signUpError;
        if (!signUpData.user) throw new Error('Failed to create account');

        // Create profile
        await createProfile(signUpData.user.id, username);

        setSuccessMessage('Account created successfully!');
        onAuthSuccess(signUpData.user);
        handleModalClose();
      } else {
        if (attempts >= 4) {
          setIsLocked(true);
          setLockTimer(300); // 5 minutes
          throw new Error('Too many failed attempts. Try again in 5 minutes.');
        }

        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) throw signInError;
        if (!signInData.user) throw new Error('Failed to sign in');

        if (rememberMe) {
          localStorage.setItem('rememberMe', 'true');
          localStorage.setItem('lastEmail', email);
        } else {
          localStorage.removeItem('rememberMe');
          localStorage.removeItem('lastEmail');
        }

        setAttempts(0);
        onAuthSuccess(signInData.user);
        handleModalClose();
      }
    } catch (error) {
      console.error('Auth error:', error);
      handleAuthError(error);
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

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2 text-red-600"
            >
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm">{error}</p>
            </motion.div>
          )}

          {successMessage && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md flex items-center gap-2 text-green-600"
            >
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
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