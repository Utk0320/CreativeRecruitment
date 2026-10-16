import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Mail, Lock, ArrowRight } from 'lucide-react';
import { GoogleLogin, GoogleOAuthProvider } from '@react-oauth/google';
import api from '../api';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();
    const { login, setUser } = useAuth();

    const completeSso = (user) => {
        setUser(user);
        navigate(user.role === 'student' ? '/student/dashboard' : '/coordinator/dashboard');
    };

    const handleConsoleSso = async () => {
        setError('');
        setIsLoading(true);
        try {
            const response = await api.post('/auth/sso/console', { email });
            completeSso(response.data.user);
        } catch (err) {
            setError(err.response?.data?.error || 'College sign-in failed.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);
        try {
            const loggedInUser = await login(email, password);
            navigate(loggedInUser.role === 'student'
                ? '/student/dashboard'
                : loggedInUser.role === 'admin' ? '/admin/users' : '/coordinator/dashboard');
        } catch (err) {
            setError(err.response?.data?.error || 'Invalid credentials. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex">
            {/* Left Side - Form */}
            <div className="flex-1 flex flex-col justify-center py-12 px-4 sm:px-6 lg:flex-none lg:px-20 xl:px-24 bg-white shadow-2xl z-10 relative">
                <div className="mx-auto w-full max-w-sm lg:w-96">
                    <div className="mb-10 text-center lg:text-left">
                        <Link to="/" className="inline-block">
                            <span className="text-3xl font-extrabold text-indigo-600 tracking-tight">CreativeRecruit</span>
                        </Link>
                        <h2 className="mt-6 text-3xl font-bold text-gray-900">Welcome back</h2>
                        <p className="mt-2 text-sm text-gray-600">
                            Don't have an account?{' '}
                            <Link to="/register" className="font-medium text-indigo-600 hover:text-indigo-500 transition-colors">
                                Create one now
                            </Link>
                        </p>
                    </div>

                    <div className="mt-8">
                        {error && (
                            <div className={`mb-4 rounded-xl border p-4 text-sm ${error.includes('pending') ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-red-300 bg-red-50 text-red-700'}`} role="alert">
                                <p className="font-medium">{error}</p>
                                {error.includes('pending') && (
                                    <p className="mt-1 text-xs text-amber-700">
                                        Your registration details have been submitted. An administrator must approve your account before you can log in.
                                    </p>
                                )}
                            </div>
                        )}
                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
                                <div className="relative rounded-md shadow-sm">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Mail className="h-5 w-5 text-gray-400" />
                                    </div>
                                    <input
                                        type="email"
                                        required
                                        className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-xl py-3 bg-gray-50 border hover:bg-white transition-colors"
                                        placeholder="you@gmail.com or you@college.edu"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                                <div className="relative rounded-md shadow-sm">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Lock className="h-5 w-5 text-gray-400" />
                                    </div>
                                    <input
                                        type="password"
                                        required
                                        className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-xl py-3 bg-gray-50 border hover:bg-white transition-colors"
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                    />
                                </div>
                                <Link to="/forgot-password" className="mt-2 inline-block text-sm font-medium text-indigo-700 hover:text-indigo-900">Forgot password?</Link>
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all duration-200 disabled:opacity-70 cursor-pointer"
                            >
                                {isLoading ? 'Signing in...' : 'Sign in'}
                                {!isLoading && <ArrowRight className="ml-2 w-4 h-4" />}
                            </button>
                        </form>

                        {(import.meta.env.VITE_SSO_PROVIDER === 'console' || import.meta.env.VITE_GOOGLE_CLIENT_ID) && (
                            <div className="relative my-6">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-gray-200" />
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                    <span className="bg-white px-3 text-gray-400 font-medium">Or continue with SSO</span>
                                </div>
                            </div>
                        )}

                        {import.meta.env.VITE_SSO_PROVIDER === 'console' && (
                            <button type="button" disabled={isLoading || !email} onClick={handleConsoleSso}
                                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors shadow-xs">
                                Single Sign-On (Dev Console)
                            </button>
                        )}
                        {import.meta.env.VITE_GOOGLE_CLIENT_ID && (
                            <div className="flex justify-center">
                                <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
                                    <GoogleLogin
                                        onSuccess={async response => {
                                            try {
                                                const result = await api.post('/auth/sso/google', { credential: response.credential });
                                                completeSso(result.data.user);
                                            } catch (err) {
                                                setError(err.response?.data?.error || 'Google college sign-in failed.');
                                            }
                                        }}
                                        onError={() => setError('Google college sign-in failed.')}
                                    />
                                </GoogleOAuthProvider>
                            </div>
                        )}

                    </div>
                </div>
            </div>

            {/* Right Side - Image/Graphic */}
            <div className="hidden lg:block relative w-0 flex-1 bg-indigo-900">
                <div className="absolute inset-0 h-full w-full bg-gradient-to-br from-indigo-600 to-purple-800 opacity-90"></div>
                {/* Decorative Pattern */}
                <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 1463 860">
                    <path className="text-indigo-500 text-opacity-40" fill="currentColor" d="M-82.673 72l1761.849 472.086-134.327 501.315-1761.85-472.086z" />
                    <path className="text-indigo-700 text-opacity-40" fill="currentColor" d="M-217.088 544.086L1544.761 72l134.327 501.316-1761.849 472.086z" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center p-20 text-center">
                    <div>
                        <h2 className="text-4xl font-bold text-white mb-6 leading-tight">Your gateway to campus life.</h2>
                        <p className="text-indigo-200 text-lg max-w-md mx-auto">Join a community of thousands of students exploring opportunities and building their futures.</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;
