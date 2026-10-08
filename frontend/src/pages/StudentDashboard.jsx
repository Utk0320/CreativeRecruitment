import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Briefcase, CheckCircle, Bell, ChevronRight, Search, Star, Check } from 'lucide-react';

const StudentDashboard = () => {
    const { user } = useAuth();
    const [applications, setApplications] = useState([]);
    const [drives, setDrives] = useState([]);
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [appsRes, drivesRes, notifRes] = await Promise.all([
                    axios.get('http://localhost:5000/api/applications'),
                    axios.get('http://localhost:5000/api/drives'),
                    axios.get('http://localhost:5000/api/notifications')
                ]);
                setApplications(appsRes.data);
                setDrives(drivesRes.data.filter(d => d.status === 'open'));
                setNotifications(notifRes.data.slice(0, 5)); // Top 5 notifications
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    if (!user || user.role !== 'student') {
        return <div className="p-8 text-center text-red-500">Access Denied</div>;
    }

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div></div>;
    }

    const stats = {
        total: applications.length,
        underReview: applications.filter(a => a.status === 'Under Review').length,
        shortlisted: applications.filter(a => a.status === 'Shortlisted').length,
        selected: applications.filter(a => a.status === 'Selected').length,
    };

    const getStatusColor = (status) => {
        switch(status) {
            case 'Selected': return 'bg-green-100 text-green-800 border-green-200';
            case 'Shortlisted': return 'bg-purple-100 text-purple-800 border-purple-200';
            case 'Rejected': return 'bg-red-100 text-red-800 border-red-200';
            case 'Under Review': return 'bg-blue-100 text-blue-800 border-blue-200';
            default: return 'bg-gray-100 text-gray-800 border-gray-200';
        }
    };

    const markNotificationRead = async (notification) => {
        try {
            await axios.put(`http://localhost:5000/api/notifications/${notification.id}/read`);
            setNotifications(current => current.map(item => item.id === notification.id ? { ...item, is_read: true } : item));
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 pb-12">
            {/* Header */}
            <div className="bg-indigo-700 text-white pb-24 pt-8">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center">
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight">Welcome back, {user.name.split(' ')[0]}! 👋</h1>
                            <p className="mt-2 text-indigo-200">Here's what's happening with your applications today.</p>
                        </div>
                        <Link to="/student/apply" className="hidden sm:flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors font-medium text-sm">
                            <Search className="w-4 h-4 mr-2" /> Apply to Clubs
                        </Link>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-16 relative z-10">
                {/* Stats */}
                <div className="grid grid-cols-3 gap-3 md:gap-4 mb-8">
                    <div className="bg-white rounded-2xl shadow-sm p-4 md:p-6 border border-gray-100 flex flex-col md:flex-row items-start md:items-center">
                        <div className="p-3 bg-indigo-50 rounded-xl mb-3 md:mb-0 md:mr-4">
                            <Briefcase className="w-6 h-6 text-indigo-600" />
                        </div>
                        <div>
                            <p className="text-xs md:text-sm font-medium text-gray-500">Total Applied</p>
                            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                        </div>
                    </div>
                    <div className="bg-white rounded-2xl shadow-sm p-4 md:p-6 border border-gray-100 flex flex-col md:flex-row items-start md:items-center">
                        <div className="p-3 bg-purple-50 rounded-xl mb-3 md:mb-0 md:mr-4">
                            <Star className="w-6 h-6 text-purple-600" />
                        </div>
                        <div>
                            <p className="text-xs md:text-sm font-medium text-gray-500">Shortlisted</p>
                            <p className="text-2xl font-bold text-gray-900">{stats.shortlisted}</p>
                        </div>
                    </div>
                    <div className="bg-white rounded-2xl shadow-sm p-4 md:p-6 border border-gray-100 flex flex-col md:flex-row items-start md:items-center">
                        <div className="p-3 bg-green-50 rounded-xl mb-3 md:mb-0 md:mr-4">
                            <CheckCircle className="w-6 h-6 text-green-600" />
                        </div>
                        <div>
                            <p className="text-xs md:text-sm font-medium text-gray-500">Selected</p>
                            <p className="text-2xl font-bold text-gray-900">{stats.selected}</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Main Content - Applications */}
                    <div className="lg:col-span-2 space-y-8">
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                                <h2 className="text-xl font-bold text-gray-900">Recent Applications</h2>
                                <Link to="/student/applications" className="text-sm text-indigo-600 font-medium hover:text-indigo-800 flex items-center">
                                    View all <ChevronRight className="w-4 h-4 ml-1" />
                                </Link>
                            </div>
                            <div className="divide-y divide-gray-100">
                                {applications.length === 0 ? (
                                    <div className="p-10 text-center">
                                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
                                            <Briefcase className="w-8 h-8 text-gray-400" />
                                        </div>
                                        <h3 className="text-lg font-medium text-gray-900 mb-1">No applications yet</h3>
                                        <p className="text-gray-500 mb-4">Start exploring active recruitment drives and apply to your favorites.</p>
                                        <Link to="/student/apply" className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700">
                                            Apply to Clubs
                                        </Link>
                                    </div>
                                ) : (
                                    applications.slice(0, 5).map(app => (
                                        <div key={app.id} className="p-6 hover:bg-gray-50 transition-colors">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <h3 className="text-lg font-bold text-gray-900">{app.club_name}</h3>
                                                    <p className="text-sm text-gray-600">{app.drive_title}</p>
                                                    <p className="text-xs text-gray-400 mt-2">Applied on {new Date(app.applied_at).toLocaleDateString()}</p>
                                                </div>
                                                <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(app.status)}`}>
                                                    {app.status}
                                                </span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Active Opportunities */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                            <div className="p-6 border-b border-gray-100">
                                <h2 className="text-xl font-bold text-gray-900">Active Opportunities</h2>
                                <p className="text-sm text-gray-500 mt-1">Recruitment drives ending soon</p>
                            </div>
                            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {drives.slice(0, 4).map(drive => {
                                    const hasApplied = applications.some(app => app.drive_id === drive.id);
                                    return (
                                        <div key={drive.id} className="border border-gray-100 rounded-xl p-4 hover:border-indigo-200 hover:shadow-md transition-all">
                                            <h3 className="font-bold text-gray-900 mb-1">{drive.club_name}</h3>
                                            <p className="text-sm text-gray-600 mb-4 truncate">{drive.title}</p>
                                            <div className="flex justify-between items-center">
                                                <span className="text-xs text-red-500 font-medium bg-red-50 px-2 py-1 rounded">
                                                    Due {new Date(drive.deadline).toLocaleDateString()}
                                                </span>
                                                {hasApplied ? (
                                                    <span className="text-xs font-bold text-gray-400 cursor-not-allowed">
                                                        Applied
                                                    </span>
                                                ) : (
                                                    <Link to={`/student/apply/${drive.id}`} className="text-xs font-bold text-indigo-600 hover:text-indigo-800">
                                                        Apply
                                                    </Link>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Sidebar */}
                    <div className="space-y-8">
                        {/* Notifications */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                            <div className="p-6 border-b border-gray-100 flex items-center">
                                <Bell className="w-5 h-5 text-gray-400 mr-2" />
                                <h2 className="text-lg font-bold text-gray-900">Notifications</h2>
                            </div>
                            <div className="divide-y divide-gray-100">
                                {notifications.length === 0 ? (
                                    <div className="p-6 text-center text-gray-500 text-sm">
                                        You're all caught up!
                                    </div>
                                ) : (
                                    notifications.map(notif => (
                                        <button
                                            key={notif.id}
                                            onClick={() => !notif.is_read && markNotificationRead(notif)}
                                            className={`w-full p-4 text-left transition-colors ${notif.is_read ? 'bg-white hover:bg-gray-50' : 'bg-indigo-50 hover:bg-indigo-100'}`}
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <p className="text-sm font-semibold text-gray-900">{notif.title}</p>
                                                {!notif.is_read && <Check className="h-4 w-4 text-indigo-600" />}
                                            </div>
                                            <p className="text-sm text-gray-600 mt-1 line-clamp-2">{notif.message}</p>
                                            <p className="text-xs text-gray-400 mt-2">{new Date(notif.created_at).toLocaleDateString()}</p>
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Profile Card */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                            <div className="flex items-center space-x-4 mb-6">
                                {user.profile_picture_url ? (
                                    <img src={`http://localhost:5000${user.profile_picture_url}`} alt={user.name} className="w-16 h-16 rounded-full object-cover border border-gray-200" />
                                ) : (
                                    <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xl border border-indigo-200">
                                        {user.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                                    </div>
                                )}
                                <div>
                                    <h2 className="text-lg font-bold text-gray-900">{user.name}</h2>
                                    <p className="text-sm text-gray-500">
                                        {user.department || 'Department not set'} • {user.year ? `${user.year}${user.year === 1 ? 'st' : user.year === 2 ? 'nd' : user.year === 3 ? 'rd' : 'th'} Year` : 'Year not set'}
                                    </p>
                                    <p className="text-xs text-gray-400 mt-1">MMCOE, Pune</p>
                                </div>
                            </div>
                            
                            <div className="mb-6">
                                <div className="flex justify-between text-sm mb-1">
                                    <span className="font-medium text-gray-700">Profile completion</span>
                                    <span className="font-bold text-indigo-600">
                                        {(() => {
                                            let score = 0;
                                            if (user.profile_picture_url) score += 15;
                                            if (user.bio) score += 15;
                                            if (user.department && user.year) score += 10;
                                            try { if (user.skills && JSON.parse(user.skills).length > 0) score += 15; } catch (e) {}
                                            try { if (user.interests && JSON.parse(user.interests).length > 0) score += 15; } catch (e) {}
                                            try { if (user.projects && JSON.parse(user.projects).length > 0) score += 15; } catch (e) {}
                                            try { if (user.achievements && JSON.parse(user.achievements).length > 0) score += 15; } catch (e) {}
                                            return Math.min(score, 100);
                                        })()}%
                                    </span>
                                </div>
                                <div className="w-full bg-gray-100 rounded-full h-2.5">
                                    <div className="bg-indigo-600 h-2.5 rounded-full transition-all duration-500" style={{ width: `${(() => {
                                        let score = 0;
                                        if (user.profile_picture_url) score += 15;
                                        if (user.bio) score += 15;
                                        if (user.department && user.year) score += 10;
                                        try { if (user.skills && JSON.parse(user.skills).length > 0) score += 15; } catch (e) {}
                                        try { if (user.interests && JSON.parse(user.interests).length > 0) score += 15; } catch (e) {}
                                        try { if (user.projects && JSON.parse(user.projects).length > 0) score += 15; } catch (e) {}
                                        try { if (user.achievements && JSON.parse(user.achievements).length > 0) score += 15; } catch (e) {}
                                        return Math.min(score, 100);
                                    })()}%` }}></div>
                                </div>
                            </div>

                            <Link to="/student/profile" className="w-full flex justify-center py-2 px-4 border border-indigo-200 rounded-lg shadow-sm text-sm font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors">
                                View Profile
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StudentDashboard;
