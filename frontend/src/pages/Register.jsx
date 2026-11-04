import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Mail, Lock, User, Building, Phone, GraduationCap, ArrowRight, FileText, Hash, Clock } from 'lucide-react';

const DEPARTMENTS = [
    'Computer Engineering',
    'Information Technology',
    'Artificial Intelligence & Data Science',
    'Electronics & Telecommunication',
    'Mechanical Engineering',
    'Electrical Engineering',
    'Civil Engineering',
    'Applied Sciences / General'
];

const Register = () => {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        prn: '',
        department: '',
        year: '',
        phone: '',
        bio: '',
        password: '',
        confirmPassword: ''
    });
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [submittedDetails, setSubmittedDetails] = useState(null);
    const { register } = useAuth();

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (formData.password !== formData.confirmPassword) {
            return setError('Passwords do not match.');
        }
        if (formData.password.length < 10) {
            return setError('Password must contain at least 10 characters.');
        }

        const email = formData.email.trim().toLowerCase();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return setError('Please enter a valid email address (e.g. name@gmail.com).');
        }

        if (!formData.prn.trim()) {
            return setError('Please provide your College Roll Number or PRN.');
        }

        if (!formData.department) {
            return setError('Please select your department.');
        }

        if (!formData.year) {
            return setError('Please select your year of study.');
        }

        setIsLoading(true);
        try {
            await register({
                name: formData.name.trim(),
                email,
                password: formData.password,
                department: formData.department,
                year: Number(formData.year),
                phone: formData.phone.trim(),
                prn: formData.prn.trim(),
                bio: formData.bio.trim()
            });

            setSubmittedDetails({
                name: formData.name.trim(),
                email,
                prn: formData.prn.trim(),
                department: formData.department,
                year: formData.year,
                phone: formData.phone.trim(),
                bio: formData.bio.trim()
            });
            setSubmitted(true);
        } catch (err) {
            setError(err.response?.data?.error || 'Registration request could not be processed. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    if (submitted && submittedDetails) {
        return (
            <main className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-gray-50 flex items-center justify-center px-4 py-12">
                <section className="w-full max-w-xl rounded-2xl border border-gray-200 bg-white p-8 shadow-xl">
                    <div className="flex flex-col items-center text-center">
                        <div className="h-16 w-16 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 mb-4 ring-8 ring-amber-50">
                            <Clock className="h-8 w-8" />
                        </div>
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 mb-3">
                            Status: Pending Admin Approval
                        </span>
                        <h1 className="text-2xl font-bold text-gray-900">Registration Submitted!</h1>
                        <p className="mt-2 text-sm text-gray-600 max-w-md">
                            Thank you, <span className="font-semibold text-gray-800">{submittedDetails.name}</span>. Your registration details have been securely submitted to the administrator for review and approval.
                        </p>
                    </div>

                    <div className="mt-6 rounded-xl border border-gray-100 bg-gray-50 p-5 space-y-3 text-sm">
                        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Submitted Profile Information</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-gray-700">
                            <div>
                                <span className="text-xs text-gray-500 block">Email Address</span>
                                <span className="font-medium break-all">{submittedDetails.email}</span>
                            </div>
                            <div>
                                <span className="text-xs text-gray-500 block">Roll No / PRN</span>
                                <span className="font-medium font-mono break-all">{submittedDetails.prn}</span>
                            </div>
                            <div>
                                <span className="text-xs text-gray-500 block">Department</span>
                                <span className="font-medium break-words">{submittedDetails.department}</span>
                            </div>
                            <div>
                                <span className="text-xs text-gray-500 block">Year of Study</span>
                                <span className="font-medium">{submittedDetails.year}{submittedDetails.year === '1' ? 'st' : submittedDetails.year === '2' ? 'nd' : submittedDetails.year === '3' ? 'rd' : 'th'} Year</span>
                            </div>
                            {submittedDetails.phone && (
                                <div className="sm:col-span-2">
                                    <span className="text-xs text-gray-500 block">Phone Number</span>
                                    <span className="font-medium">{submittedDetails.phone}</span>
                                </div>
                            )}
                            {submittedDetails.bio && (
                                <div className="sm:col-span-2 border-t border-gray-200/60 pt-2">
                                    <span className="text-xs text-gray-500 block">Statement / Bio</span>
                                    <span className="text-gray-600 text-xs italic break-words">{submittedDetails.bio}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="mt-6 rounded-lg bg-blue-50 border border-blue-100 p-4 text-xs text-blue-800 leading-relaxed">
                        <p className="font-semibold text-blue-900 mb-1">What happens next?</p>
                        The administrator will verify your student credentials and PRN. Once approved, you can log in directly using your email (<span className="font-medium">{submittedDetails.email}</span>) and the password you selected.
                    </div>

                    <div className="mt-6 flex flex-col sm:flex-row gap-3">
                        <Link
                            to="/login"
                            className="flex-1 flex justify-center items-center py-2.5 px-4 rounded-xl shadow-sm text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
                        >
                            Return to Login
                        </Link>
                    </div>
                </section>
            </main>
        );
    }

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
                        <h2 className="text-4xl font-bold text-white mb-6 leading-tight">Start your recruitment journey.</h2>
                        <p className="text-indigo-200 text-lg max-w-md mx-auto">
                            Submit your student registration. Once verified and approved by the college administrator, you will receive full access to apply to club drives and track results.
                        </p>
                    </div>
                </div>
            </div>

            {/* Right Side - Form */}
            <div className="flex-1 flex flex-col justify-center py-12 px-4 sm:px-6 lg:flex-none lg:px-20 xl:px-24 bg-white shadow-2xl z-10 overflow-y-auto">
                <div className="mx-auto w-full max-w-lg">
                    <div className="mb-6 text-center lg:text-left">
                        <Link to="/" className="inline-block">
                            <span className="text-3xl font-extrabold text-indigo-600 tracking-tight">CreativeRecruit</span>
                        </Link>
                        <h2 className="mt-5 text-2xl font-bold text-gray-900">Student Registration</h2>
                        <p className="mt-1 text-sm text-gray-600">
                            Already have an approved account?{' '}
                            <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-500 transition-colors">
                                Sign in here
                            </Link>
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {error && (
                            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-md" role="alert">
                                <p className="text-sm text-red-700">{error}</p>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Full Name */}
                            <div className="md:col-span-2">
                                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                                    Full Name <span className="text-red-500">*</span>
                                </label>
                                <div className="relative rounded-md shadow-sm">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <User className="h-4 w-4 text-gray-400" />
                                    </div>
                                    <input
                                        type="text"
                                        name="name"
                                        required
                                        placeholder="e.g. Aditi Sharma"
                                        value={formData.name}
                                        className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-9 text-sm border-gray-300 rounded-xl py-2.5 bg-gray-50 border hover:bg-white transition-colors"
                                        onChange={handleChange}
                                    />
                                </div>
                            </div>

                            {/* Email */}
                            <div className="md:col-span-2">
                                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                                    Email Address <span className="text-red-500">*</span>
                                </label>
                                <div className="relative rounded-md shadow-sm">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Mail className="h-4 w-4 text-gray-400" />
                                    </div>
                                    <input
                                        type="email"
                                        name="email"
                                        required
                                        placeholder="you@gmail.com or student@college.edu"
                                        value={formData.email}
                                        className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-9 text-sm border-gray-300 rounded-xl py-2.5 bg-gray-50 border hover:bg-white transition-colors"
                                        onChange={handleChange}
                                    />
                                </div>
                                <p className="mt-1 text-xs text-gray-500">
                                    Any standard email address is accepted (Gmail, college email, etc.).
                                </p>
                            </div>

                            {/* Roll Number / PRN */}
                            <div>
                                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                                    PRN / Roll Number <span className="text-red-500">*</span>
                                </label>
                                <div className="relative rounded-md shadow-sm">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Hash className="h-4 w-4 text-gray-400" />
                                    </div>
                                    <input
                                        type="text"
                                        name="prn"
                                        required
                                        placeholder="e.g. 72012345B"
                                        value={formData.prn}
                                        className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-9 text-sm border-gray-300 rounded-xl py-2.5 bg-gray-50 border hover:bg-white transition-colors"
                                        onChange={handleChange}
                                    />
                                </div>
                            </div>

                            {/* Phone */}
                            <div>
                                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                                    Phone Number <span className="text-red-500">*</span>
                                </label>
                                <div className="relative rounded-md shadow-sm">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Phone className="h-4 w-4 text-gray-400" />
                                    </div>
                                    <input
                                        type="tel"
                                        name="phone"
                                        required
                                        placeholder="e.g. 9876543210"
                                        value={formData.phone}
                                        className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-9 text-sm border-gray-300 rounded-xl py-2.5 bg-gray-50 border hover:bg-white transition-colors"
                                        onChange={handleChange}
                                    />
                                </div>
                            </div>

                            {/* Department */}
                            <div>
                                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                                    Department <span className="text-red-500">*</span>
                                </label>
                                <div className="relative rounded-md shadow-sm">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Building className="h-4 w-4 text-gray-400" />
                                    </div>
                                    <select
                                        name="department"
                                        required
                                        value={formData.department}
                                        className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-9 text-sm border-gray-300 rounded-xl py-2.5 bg-gray-50 border hover:bg-white transition-colors"
                                        onChange={handleChange}
                                    >
                                        <option value="">Select Department</option>
                                        {DEPARTMENTS.map(dept => (
                                            <option key={dept} value={dept}>{dept}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Year of Study */}
                            <div>
                                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                                    Year of Study <span className="text-red-500">*</span>
                                </label>
                                <div className="relative rounded-md shadow-sm">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <GraduationCap className="h-4 w-4 text-gray-400" />
                                    </div>
                                    <select
                                        name="year"
                                        required
                                        value={formData.year}
                                        className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-9 text-sm border-gray-300 rounded-xl py-2.5 bg-gray-50 border hover:bg-white transition-colors"
                                        onChange={handleChange}
                                    >
                                        <option value="">Select Year</option>
                                        <option value="1">1st Year (FE)</option>
                                        <option value="2">2nd Year (SE)</option>
                                        <option value="3">3rd Year (TE)</option>
                                        <option value="4">4th Year (BE)</option>
                                    </select>
                                </div>
                            </div>

                            {/* Statement of Intent / Bio */}
                            <div className="md:col-span-2">
                                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                                    Statement of Intent / Bio
                                </label>
                                <div className="relative rounded-md shadow-sm">
                                    <div className="absolute top-3 left-0 pl-3 flex items-center pointer-events-none">
                                        <FileText className="h-4 w-4 text-gray-400" />
                                    </div>
                                    <textarea
                                        name="bio"
                                        rows={3}
                                        placeholder="Briefly describe your areas of interest, technical skills, or why you want to join college clubs..."
                                        value={formData.bio}
                                        className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-9 text-sm border-gray-300 rounded-xl py-2 bg-gray-50 border hover:bg-white transition-colors"
                                        onChange={handleChange}
                                    />
                                </div>
                                <p className="mt-1 text-xs text-gray-400">
                                    Visible to the administrator during registration approval.
                                </p>
                            </div>

                            {/* Password */}
                            <div>
                                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                                    Password <span className="text-red-500">*</span>
                                </label>
                                <div className="relative rounded-md shadow-sm">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Lock className="h-4 w-4 text-gray-400" />
                                    </div>
                                    <input
                                        type="password"
                                        name="password"
                                        required
                                        minLength={10}
                                        placeholder="Min. 10 characters"
                                        value={formData.password}
                                        className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-9 text-sm border-gray-300 rounded-xl py-2.5 bg-gray-50 border hover:bg-white transition-colors"
                                        onChange={handleChange}
                                    />
                                </div>
                            </div>

                            {/* Confirm Password */}
                            <div>
                                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                                    Confirm Password <span className="text-red-500">*</span>
                                </label>
                                <div className="relative rounded-md shadow-sm">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Lock className="h-4 w-4 text-gray-400" />
                                    </div>
                                    <input
                                        type="password"
                                        name="confirmPassword"
                                        required
                                        minLength={10}
                                        placeholder="Re-enter password"
                                        value={formData.confirmPassword}
                                        className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-9 text-sm border-gray-300 rounded-xl py-2.5 bg-gray-50 border hover:bg-white transition-colors"
                                        onChange={handleChange}
                                    />
                                </div>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full flex justify-center items-center mt-6 py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all duration-200 disabled:opacity-70 cursor-pointer"
                        >
                            {isLoading ? 'Submitting Application...' : 'Submit Registration for Approval'}
                            {!isLoading && <ArrowRight className="ml-2 w-4 h-4" />}
                        </button>

                        <p className="text-center text-xs text-gray-500 mt-3">
                            By submitting, your details will be verified by the administrator before account access is granted.
                        </p>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default Register;
