import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { Briefcase, FileText, CheckCircle, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';

const CoordinatorDashboard = () => {
    const { user } = useAuth();
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

            {clubs.length > 1 && (
                <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                    <p className="mb-3 text-sm font-semibold text-gray-700">Your clubs</p>
                    <div className="flex flex-wrap gap-2">
                        {clubs.map(item => (
                            <button key={item.id} onClick={() => setClub(item)} className={`rounded-full px-4 py-2 text-sm font-medium ${club?.id === item.id ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                                {item.name}
                            </button>
                        ))}
                    </div>
                </div>
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
