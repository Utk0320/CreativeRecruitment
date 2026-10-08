import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Mail, Lock, User, Building, Phone, GraduationCap, ArrowRight } from 'lucide-react';

const Register = () => {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        confirmPassword: '',
        role: 'student',
        department: '',
        year: '',
        phone: ''
    });
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();
    const { register } = useAuth();

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        
        if (formData.password !== formData.confirmPassword) {
            return setError('Passwords do not match');
        }

        const email = formData.email.trim().toLowerCase();
        const expectedPattern = formData.role === 'coordinator'
            ? 'name@mmcoe.edu.in'
            : 'nameXXXX.department@mmcoe.edu.in';
        const isOfficialCollegeEmail = formData.role === 'coordinator'
            ? /^[^\s@]+@mmcoe\.edu\.in$/i.test(email)
            : /^[^\s@]+\d+\.[a-z]+@mmcoe\.edu\.in$/i.test(email);

        if (!isOfficialCollegeEmail) {
            return setError(`Use an official MMCOE email matching ${expectedPattern}.`);
        }

        setIsLoading(true);
        try {
            await register(formData);
            alert('Registration successful! You can now sign in.');
            navigate('/login');
        } catch (err) {
            setError(err.response?.data?.error || 'Registration failed. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex">
            {/* Left Side - Graphic */}
            <div className="hidden lg:block relative w-0 flex-1 bg-indigo-900">
                <div className="absolute inset-0 h-full w-full bg-gradient-to-br from-indigo-800 to-purple-900 opacity-90"></div>
                <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 1463 860">
                    <path className="text-indigo-500 text-opacity-30" fill="currentColor" d="M-82.673 72l1761.849 472.086-134.327 501.315-1761.85-472.086z" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center p-20 text-center">
                    <div>
                        <h2 className="text-4xl font-bold text-white mb-6 leading-tight">Start your journey today.</h2>
                        <p className="text-indigo-200 text-lg max-w-md mx-auto">Create an account to discover clubs, manage recruitment, and connect with your campus.</p>
                    </div>
                </div>
            </div>

            {/* Right Side - Form */}
            <div className="flex-1 flex flex-col justify-center py-12 px-4 sm:px-6 lg:flex-none lg:px-20 xl:px-24 bg-white shadow-2xl z-10 overflow-y-auto">
                <div className="mx-auto w-full max-w-lg">
                    <div className="mb-8 text-center lg:text-left">
                        <Link to="/" className="inline-block">
                            <span className="text-3xl font-extrabold text-indigo-600 tracking-tight">CreativeRecruit</span>
                        </Link>
                        <h2 className="mt-6 text-3xl font-bold text-gray-900">Create an account</h2>
                        <p className="mt-2 text-sm text-gray-600">
                            Already have an account?{' '}
                            <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-500 transition-colors">
                                Sign in here
                            </Link>
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        {error && (
                            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-md">
                                <p className="text-sm text-red-700">{error}</p>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            {/* Role Selection */}
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-2">I am a...</label>
                                <div className="grid grid-cols-2 gap-4">
                                    <button
                                        type="button"
                                        onClick={() => setFormData({...formData, role: 'student'})}
                                        className={`py-3 border rounded-xl text-sm font-medium transition-colors ${formData.role === 'student' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                                    >
                                        Student
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFormData({...formData, role: 'coordinator'})}
                                        className={`py-3 border rounded-xl text-sm font-medium transition-colors ${formData.role === 'coordinator' ? 'bg-purple-50 border-purple-500 text-purple-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                                    >
                                        Club Coordinator
                                    </button>
                                </div>
                            </div>

                            {/* Full Name */}
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                                <div className="relative rounded-md shadow-sm">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <User className="h-5 w-5 text-gray-400" />
                                    </div>
                                    <input
                                        type="text"
                                        name="name"
                                        required
                                        className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-xl py-2.5 bg-gray-50 border hover:bg-white"
                                        onChange={handleChange}
                                    />
                                </div>
                            </div>

                            {/* Email */}
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">College Email</label>
                                <div className="relative rounded-md shadow-sm">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Mail className="h-5 w-5 text-gray-400" />
                                    </div>
                                    <input
                                        type="email"
                                        name="email"
                                        required
                                        placeholder={formData.role === 'student' ? 'name2025.department@mmcoe.edu.in' : 'name@mmcoe.edu.in'}
                                        className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-xl py-2.5 bg-gray-50 border hover:bg-white"
                                        onChange={handleChange}
                                    />
                                </div>
                                <p className="mt-2 text-xs text-gray-500">
                                    {formData.role === 'student'
                                        ? 'Student emails must include your joining year and department code.'
                                        : 'Coordinator emails must use the official college domain.'}
                                </p>
                            </div>

                            {/* Department */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                                <div className="relative rounded-md shadow-sm">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Building className="h-5 w-5 text-gray-400" />
                                    </div>
                                    <input
                                        type="text"
                                        name="department"
                                        required
                                        className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-xl py-2.5 bg-gray-50 border hover:bg-white"
                                        onChange={handleChange}
                                    />
                                </div>
                            </div>

                            {/* Year */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Year of Study</label>
                                <div className="relative rounded-md shadow-sm">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <GraduationCap className="h-5 w-5 text-gray-400" />
                                    </div>
                                    <select
                                        name="year"
                                        required
                                        className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-xl py-2.5 bg-gray-50 border hover:bg-white appearance-none"
                                        onChange={handleChange}
                                    >
                                        <option value="">Select Year</option>
                                        <option value="1">1st Year</option>
                                        <option value="2">2nd Year</option>
                                        <option value="3">3rd Year</option>
                                        <option value="4">4th Year</option>
                                    </select>
                                </div>
                            </div>

                            {/* Password */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                                <div className="relative rounded-md shadow-sm">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Lock className="h-5 w-5 text-gray-400" />
                                    </div>
                                    <input
                                        type="password"
                                        name="password"
                                        required
                                        className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-xl py-2.5 bg-gray-50 border hover:bg-white"
                                        onChange={handleChange}
                                    />
                                </div>
                            </div>

                            {/* Confirm Password */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
                                <div className="relative rounded-md shadow-sm">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Lock className="h-5 w-5 text-gray-400" />
                                    </div>
                                    <input
                                        type="password"
                                        name="confirmPassword"
                                        required
                                        className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-xl py-2.5 bg-gray-50 border hover:bg-white"
                                        onChange={handleChange}
                                    />
                                </div>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full flex justify-center items-center mt-8 py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all duration-200 disabled:opacity-70"
                        >
                            {isLoading ? 'Creating account...' : 'Create Account'}
                            {!isLoading && <ArrowRight className="ml-2 w-4 h-4" />}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default Register;
