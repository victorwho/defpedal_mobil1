
import React, { useState } from 'react';
import { signInWithEmail, signUpWithEmail, signInWithGoogle } from '../services/supabase';
import { XIcon, UserIcon, MailIcon, LockIcon, GoogleIcon } from './Icons';

interface AuthProps {
    onClose: () => void;
}

const Auth: React.FC<AuthProps> = ({ onClose }) => {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setMessage(null);
        setIsLoading(true);

        try {
            if (isLogin) {
                const { error } = await signInWithEmail(email, password);
                if (error) throw error;
                // On successful login, the onAuthStateChange in App.tsx will trigger closes
                onClose();
            } else {
                const { data, error } = await signUpWithEmail(email, password);
                if (error) throw error;
                
                if (data?.user && !data?.session) {
                    setMessage("Registration successful! Please check your email to confirm your account.");
                    setIsLogin(true); // Switch to login view
                    // Don't close immediately so they can read the message
                } else {
                    onClose();
                }
            }
        } catch (err: any) {
            setError(err.message || 'An error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        setError(null);
        setIsLoading(true);
        try {
            const { error } = await signInWithGoogle();
            if (error) throw error;
            // Google auth redirects, so usually code execution stops here
        } catch (err: any) {
            setError(err.message || 'An error occurred with Google login');
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[2001] bg-gray-900/90 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
            <div className="w-full max-w-sm bg-gray-800 rounded-2xl shadow-2xl border border-gray-700 overflow-hidden">
                
                {/* Header */}
                <div className="relative p-6 text-center border-b border-gray-700">
                    <button 
                        onClick={onClose}
                        className="absolute right-4 top-4 p-2 text-gray-400 hover:text-white transition"
                    >
                        <XIcon className="w-5 h-5" />
                    </button>
                    <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4 text-yellow-400">
                        <UserIcon className="w-8 h-8" />
                    </div>
                    <h2 className="text-2xl font-bold text-white">
                        {isLogin ? 'Welcome Back' : 'Create Account'}
                    </h2>
                    <p className="text-sm text-gray-400 mt-1">
                        {isLogin ? 'Sign in to sync your trips' : 'Join Defensive Pedal today'}
                    </p>
                </div>

                {/* Form */}
                <div className="p-6">
                    {error && (
                        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-sm">
                            {error}
                        </div>
                    )}
                    {message && (
                        <div className="mb-4 p-3 bg-green-500/10 border border-green-500/50 rounded-lg text-green-400 text-sm">
                            {message}
                        </div>
                    )}
                    
                    {/* Google Login Button */}
                    <button
                        type="button"
                        onClick={handleGoogleLogin}
                        disabled={isLoading}
                        className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-gray-600 rounded-xl shadow-sm text-sm font-bold text-white bg-gray-700 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 transition-colors mb-6"
                    >
                        <GoogleIcon className="w-5 h-5" />
                        Continue with Google
                    </button>

                    <div className="relative mb-6">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-gray-600"></div>
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="px-2 bg-gray-800 text-gray-400">Or continue with email</span>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-gray-400 uppercase ml-1">Email</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <MailIcon className="h-5 w-5 text-gray-500" />
                                </div>
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="block w-full pl-10 pr-3 py-3 border border-gray-600 rounded-xl leading-5 bg-gray-900 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent transition sm:text-sm"
                                    placeholder="you@example.com"
                                />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-gray-400 uppercase ml-1">Password</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <LockIcon className="h-5 w-5 text-gray-500" />
                                </div>
                                <input
                                    type="password"
                                    required
                                    minLength={6}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="block w-full pl-10 pr-3 py-3 border border-gray-600 rounded-xl leading-5 bg-gray-900 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent transition sm:text-sm"
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-gray-900 bg-yellow-400 hover:bg-yellow-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mt-6"
                        >
                            {isLoading ? 'Processing...' : (isLogin ? 'Sign In' : 'Sign Up')}
                        </button>
                    </form>

                    <div className="mt-6 text-center">
                        <p className="text-sm text-gray-400">
                            {isLogin ? "Don't have an account? " : "Already have an account? "}
                            <button
                                onClick={() => {
                                    setIsLogin(!isLogin);
                                    setError(null);
                                    setMessage(null);
                                }}
                                className="font-semibold text-yellow-400 hover:text-yellow-300 transition"
                            >
                                {isLogin ? 'Sign Up' : 'Log In'}
                            </button>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Auth;
