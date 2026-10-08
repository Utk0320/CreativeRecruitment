import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { ArrowRight, Briefcase, CheckCircle, FileText, Users } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

const CoordinatorDashboard = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [clubs, setClubs] = useState([]);
    const [club, setClub] = useState(null);
    const [stats, setStats] = useState({ totalApplications: 0, activeDrives: 0, shortlisted: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        axios.get('http://localhost:5000/api/coordinator/dashboard')
            .then(res => {
                setClubs(res.data.clubs || []);
                setClub(res.data.club || null);
                setStats(res.data.stats || stats);
            })
            .catch(err => setError(err.response?.data?.error || 'Unable to load dashboard'))
            .finally(() => setLoading(false));
    }, []);
    
    if (!user || user.role !== 'coordinator') {
        return <div className="p-8 text-center text-red-500 font-bold text-xl">Access Denied</div>;
    }

    if (loading) {
        return <div className="p-8 text-center text-gray-500">Loading dashboard...</div>;
    }
    if (error) {
        return <div className="max-w-3xl mx-auto px-4 py-12"><div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">{error}</div></div>;
    }

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900">Coordinator Dashboard</h1>
                <p className="text-gray-600 mt-2">Welcome back, {user.name}! Here is the overview across {clubs.length || 1} {clubs.length === 1 ? 'club' : 'clubs'}.</p>
            </div>

            {clubs.length > 0 && (
                <section className="mb-8 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                    <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Your clubs</p>
                            <h2 className="mt-1 text-xl font-bold text-gray-900">Choose a club to focus on</h2>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                            <Users size={16} />
                            {clubs.length} {clubs.length === 1 ? 'club' : 'clubs'} available
                        </div>
                    </div>
                    <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
                        {clubs.map(item => {
                            const isSelected = club?.id === item.id;
                            return (
                                <button
                                    key={item.id}
                                    onClick={() => navigate(`/coordinator/drives?club_id=${item.id}`)}
                                    className={`group flex min-h-24 items-center justify-between gap-4 rounded-xl border p-4 text-left transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                                        isSelected
                                            ? 'border-indigo-500 bg-indigo-50 shadow-sm ring-1 ring-indigo-500'
                                            : 'border-gray-200 bg-white hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-50/40 hover:shadow-md'
                                    }`}
                                >
                                    <span>
                                        <span className={`block text-sm font-semibold ${isSelected ? 'text-indigo-900' : 'text-gray-900'}`}>{item.name}</span>
                                    </span>
                                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition ${isSelected ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500 group-hover:bg-white group-hover:text-indigo-600'}`}>
                                        <ArrowRight size={17} />
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex items-center">
                    <div className="p-3 rounded-full bg-indigo-100 text-indigo-600 mr-4">
                        <FileText size={24} />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Total Applications</p>
                        <p className="text-3xl font-bold text-gray-900">{stats.totalApplications}</p>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex items-center">
                    <div className="p-3 rounded-full bg-green-100 text-green-600 mr-4">
                        <Briefcase size={24} />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Active Drives</p>
                        <p className="text-3xl font-bold text-gray-900">{stats.activeDrives}</p>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex items-center">
                    <div className="p-3 rounded-full bg-purple-100 text-purple-600 mr-4">
                        <CheckCircle size={24} />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Shortlisted Candidates</p>
                        <p className="text-3xl font-bold text-gray-900">{stats.shortlisted}</p>
                    </div>
                </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Quick Actions</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Link to="/coordinator/drives" className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition-colors">
                        <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600 mr-4">
                            <Briefcase size={20} />
                        </div>
                        <div>
                            <h3 className="font-semibold text-gray-900">Manage Drives</h3>
                            <p className="text-sm text-gray-500">Create or edit recruitment drives</p>
                        </div>
                    </Link>
                    <Link to="/coordinator/drives" className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition-colors">
                        <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600 mr-4">
                            <FileText size={20} />
                        </div>
                        <div>
                            <h3 className="font-semibold text-gray-900">Review Applications</h3>
                            <p className="text-sm text-gray-500">View and update candidate statuses</p>
                        </div>
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default CoordinatorDashboard;
