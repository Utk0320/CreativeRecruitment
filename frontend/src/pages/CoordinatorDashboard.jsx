import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from '../api';
import { Activity, ArrowRight, BarChart3, Briefcase, CheckCircle, Clock, Download, FileText, Inbox, TrendingUp, Users } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

const CoordinatorDashboard = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [clubs, setClubs] = useState([]);
    const [club, setClub] = useState(null);
    const [stats, setStats] = useState({ totalApplications: 0, activeDrives: 0, shortlisted: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Phase 4: Coordinator "Needs my action" inbox
    const [inbox, setInbox] = useState({ stats: { totalActionItems: 0, unreviewedCount: 0, expiringDrivesCount: 0, expiringOffersCount: 0 }, items: [] });
    const [inboxFilter, setInboxFilter] = useState('all');

    // Phase 5: Club Activity Feed
    const [activityClubId, setActivityClubId] = useState(null);
    const [activities, setActivities] = useState([]);
    const [loadingActivity, setLoadingActivity] = useState(false);

    // Phase 10: Recruitment Funnel & Analytics
    const [analyticsOverview, setAnalyticsOverview] = useState(null);
    const [funnelData, setFunnelData] = useState([]);
    const [loadingAnalytics, setLoadingAnalytics] = useState(false);
    const [exportingCsv, setExportingCsv] = useState(false);

    useEffect(() => {
        axios.get('/coordinator/dashboard')
            .then(res => {
                const loadedClubs = res.data.clubs || [];
                setClubs(loadedClubs);
                setClub(res.data.club || null);
                setStats(res.data.stats || stats);
                if (loadedClubs.length > 0) {
                    setActivityClubId(loadedClubs[0].id);
                }
            })
            .catch(err => setError(err.response?.data?.error || 'Unable to load dashboard'))
            .finally(() => setLoading(false));

        axios.get('/coordinator/inbox')
            .then(res => setInbox(res.data || { stats: {}, items: [] }))
            .catch(err => console.error('Failed to load coordinator inbox', err));
    }, []);

    useEffect(() => {
        if (!activityClubId) return;
        setLoadingActivity(true);
        axios.get(`/collaboration/activity/club/${activityClubId}`)
            .then(res => setActivities(res.data || []))
            .catch(err => console.error('Failed to load club activity', err))
            .finally(() => setLoadingActivity(false));

        setLoadingAnalytics(true);
        Promise.all([
            axios.get('/analytics/overview', { params: { club_id: activityClubId } }),
            axios.get('/analytics/funnel', { params: { club_id: activityClubId } })
        ])
            .then(([resOverview, resFunnel]) => {
                setAnalyticsOverview(resOverview.data || null);
                setFunnelData(resFunnel.data?.funnel || []);
            })
            .catch(err => console.error('Failed to load club analytics', err))
            .finally(() => setLoadingAnalytics(false));
    }, [activityClubId]);

    const handleExportCsv = async () => {
        try {
            setExportingCsv(true);
            const res = await axios.get('/analytics/export/csv', {
                params: { club_id: activityClubId },
                responseType: 'blob'
            });
            const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `club_recruitment_analytics_${activityClubId || 'all'}.csv`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Failed to export CSV', err);
        } finally {
            setExportingCsv(false);
        }
    };
    
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

            {/* Phase 4: Coordinator "Needs My Action" Inbox Queue */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-lg bg-indigo-50 text-indigo-600">
                            <Inbox size={22} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-xl font-bold text-gray-900">Needs My Action</h2>
                                <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                                    (inbox.stats?.totalActionItems || 0) > 0
                                        ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                        : 'bg-gray-100 text-gray-600'
                                }`}>
                                    {inbox.stats?.totalActionItems || 0}
                                </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">
                                Pending items requiring your attention across your club recruitment drives
                            </p>
                        </div>
                    </div>

                    {/* Filter Pills */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                            onClick={() => setInboxFilter('all')}
                            className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                                inboxFilter === 'all'
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                        >
                            All ({inbox.stats?.totalActionItems || 0})
                        </button>
                        <button
                            onClick={() => setInboxFilter('unreviewed')}
                            className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                                inboxFilter === 'unreviewed'
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                        >
                            Unreviewed ({inbox.stats?.unreviewedCount || 0})
                        </button>
                        <button
                            onClick={() => setInboxFilter('deadlines')}
                            className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                                inboxFilter === 'deadlines'
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                        >
                            Deadlines ({inbox.stats?.expiringDrivesCount || 0})
                        </button>
                        {Boolean(inbox.stats?.expiringOffersCount) && (
                            <button
                                onClick={() => setInboxFilter('offers')}
                                className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                                    inboxFilter === 'offers'
                                        ? 'bg-indigo-600 text-white'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                            >
                                Offers ({inbox.stats?.expiringOffersCount || 0})
                            </button>
                        )}
                    </div>
                </div>

                {/* Inbox Items List */}
                <div className="divide-y divide-gray-100 mt-2">
                    {((inbox.items || []).filter(item => {
                        if (inboxFilter === 'unreviewed') return item.type === 'unreviewed_application';
                        if (inboxFilter === 'deadlines') return item.type === 'deadline_approaching';
                        if (inboxFilter === 'offers') return item.type === 'expiring_offer';
                        return true;
                    })).length === 0 ? (
                        <div className="py-10 text-center">
                            <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                            <h3 className="text-sm font-bold text-gray-800">All caught up!</h3>
                            <p className="text-xs text-gray-500 mt-0.5">No pending items currently require your action.</p>
                        </div>
                    ) : (
                        ((inbox.items || []).filter(item => {
                            if (inboxFilter === 'unreviewed') return item.type === 'unreviewed_application';
                            if (inboxFilter === 'deadlines') return item.type === 'deadline_approaching';
                            if (inboxFilter === 'offers') return item.type === 'expiring_offer';
                            return true;
                        })).map(item => (
                            <div key={item.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-gray-50/80 rounded-lg px-2 transition">
                                <div className="flex items-start gap-3 min-w-0 flex-1">
                                    <div className="p-2 rounded-lg bg-gray-100 shrink-0 mt-0.5 text-gray-600">
                                        {item.type === 'unreviewed_application' ? (
                                            <FileText size={18} className="text-indigo-600" />
                                        ) : item.type === 'deadline_approaching' ? (
                                            <Clock size={18} className="text-amber-600" />
                                        ) : (
                                            <CheckCircle size={18} className="text-emerald-600" />
                                        )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-xs font-bold text-gray-900 break-words">{item.title}</span>
                                            {item.urgency === 'high' && (
                                                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-rose-100 text-rose-700 shrink-0">
                                                    High Urgency
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-600 mt-0.5 break-words">{item.description}</p>
                                        <span className="text-[10px] text-gray-400 mt-1 block">
                                            {new Date(item.created_at).toLocaleString()}
                                        </span>
                                    </div>
                                </div>

                                <Link
                                    to={item.link}
                                    className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition self-start sm:self-center"
                                >
                                    Take Action <ArrowRight size={13} />
                                </Link>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Phase 10: Club Recruitment Funnel & Analytics */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-gray-100 gap-3">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                            <BarChart3 size={20} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900">Recruitment Funnel & Analytics</h2>
                            <p className="text-xs text-gray-500">Live candidate conversion and stage drop-off metrics</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {clubs.length > 1 && (
                            <select
                                value={activityClubId || ''}
                                onChange={e => setActivityClubId(Number(e.target.value))}
                                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-gray-50 text-gray-700 font-medium focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                            >
                                {clubs.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        )}
                        <button
                            type="button"
                            onClick={handleExportCsv}
                            disabled={exportingCsv}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition shadow-2xs"
                        >
                            <Download size={13} />
                            {exportingCsv ? 'Exporting...' : 'Export CSV'}
                        </button>
                    </div>
                </div>

                {loadingAnalytics ? (
                    <div className="py-8 text-center text-xs text-gray-400">Loading club analytics...</div>
                ) : (
                    <div className="space-y-6">
                        {/* KPI mini-cards */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="p-3.5 rounded-xl border border-gray-100 bg-indigo-50/50">
                                <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Conversion Rate</span>
                                <p className="text-2xl font-bold text-indigo-700 mt-1">{analyticsOverview?.acceptance_rate ?? 0}%</p>
                                <span className="text-[10px] text-gray-400">Offered & accepted</span>
                            </div>
                            <div className="p-3.5 rounded-xl border border-gray-100 bg-emerald-50/50">
                                <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Offers Accepted</span>
                                <p className="text-2xl font-bold text-emerald-700 mt-1">{analyticsOverview?.accepted_count ?? 0}</p>
                                <span className="text-[10px] text-gray-400">Of {analyticsOverview?.offered_count ?? 0} offers</span>
                            </div>
                            <div className="p-3.5 rounded-xl border border-gray-100 bg-purple-50/50">
                                <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Avg Time-to-Hire</span>
                                <p className="text-2xl font-bold text-purple-700 mt-1">{analyticsOverview?.avg_time_to_hire_days ?? 0} <span className="text-xs font-normal">days</span></p>
                                <span className="text-[10px] text-gray-400">Application to offer</span>
                            </div>
                            <div className="p-3.5 rounded-xl border border-gray-100 bg-amber-50/50">
                                <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Total Drives</span>
                                <p className="text-2xl font-bold text-amber-700 mt-1">{analyticsOverview?.total_drives ?? 0}</p>
                                <span className="text-[10px] text-gray-400">{analyticsOverview?.active_drives ?? 0} active</span>
                            </div>
                        </div>

                        {/* Funnel visualizer */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                                    <TrendingUp size={14} className="text-indigo-600" /> Stage Conversion Pipeline
                                </span>
                                <span className="text-[11px] text-gray-400">
                                    {analyticsOverview?.total_applications ?? 0} total applications
                                </span>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                                {funnelData.map(step => (
                                    <div key={step.stage} className="p-3 rounded-xl border border-gray-100 bg-gray-50 text-left">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide truncate">{step.stage}</span>
                                        </div>
                                        <p className="text-lg font-bold text-gray-900 mt-1">{step.count}</p>
                                        <div className="mt-1.5 text-[10px] space-y-0.5">
                                            <div className="flex justify-between text-gray-500">
                                                <span>From prev:</span>
                                                <span className="font-semibold text-indigo-600">{step.conversion_from_prev}%</span>
                                            </div>
                                            {step.drop_off_count > 0 && (
                                                <div className="flex justify-between text-rose-500">
                                                    <span>Drop-off:</span>
                                                    <span>-{step.drop_off_count}</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="w-full bg-gray-200 rounded-full h-1 mt-2">
                                            <div
                                                className="bg-indigo-600 h-1 rounded-full transition-all duration-300"
                                                style={{ width: `${step.conversion_from_total || (step.count > 0 ? 100 : 0)}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Club Activity Feed */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-gray-100 gap-3">
                    <div className="flex items-center gap-2">
                        <Activity className="w-5 h-5 text-indigo-600" />
                        <h2 className="text-xl font-bold text-gray-900">Club Activity Feed</h2>
                    </div>

                    {clubs.length > 1 && (
                        <div className="flex items-center gap-2">
                            <label htmlFor="feed-club-select" className="text-xs font-semibold text-gray-500">Club:</label>
                            <select
                                id="feed-club-select"
                                value={activityClubId || ''}
                                onChange={e => setActivityClubId(Number(e.target.value))}
                                className="text-xs border border-gray-300 rounded-lg py-1.5 px-2.5 bg-white text-gray-700 font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                            >
                                {clubs.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                {loadingActivity ? (
                    <div className="py-8 text-center text-xs text-gray-400">Loading activity...</div>
                ) : activities.length === 0 ? (
                    <div className="py-8 text-center text-xs text-gray-400">
                        No team activity recorded yet for this club.
                    </div>
                ) : (
                    <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                        {activities.map(act => (
                            <div key={act.id} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-gray-50 transition border border-gray-50 text-xs">
                                <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center shrink-0 text-xs">
                                    {(act.actor_name || act.actor_role || 'U')[0].toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-1.5 truncate">
                                            <span className="font-semibold text-gray-900 truncate">
                                                {act.actor_name || act.actor_email || act.actor_role}
                                            </span>
                                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-gray-100 text-gray-600 font-medium uppercase">
                                                {act.actor_role}
                                            </span>
                                        </div>
                                        <span className="text-[10px] text-gray-400 shrink-0">
                                            {new Date(act.created_at).toLocaleString()}
                                        </span>
                                    </div>
                                    <p className="text-gray-600 mt-0.5">
                                        <span className="font-mono text-[11px] text-indigo-700 bg-indigo-50 px-1 py-0.2 rounded mr-1">
                                            {act.action}
                                        </span>
                                        <span className="text-gray-500 capitalize">{act.entity_type} #{act.entity_id}</span>
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
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
