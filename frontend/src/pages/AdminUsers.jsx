import React, { useEffect, useState } from 'react';
import {
    UserPlus, UserRoundX, UserRoundCheck, RefreshCw, KeyRound, Check, X,
    ShieldCheck, Users, Building, AlertCircle, CalendarDays, Copy,
    BarChart3, TrendingUp, Download, Trash2, Sliders, Database, ShieldAlert
} from 'lucide-react';
import api from '../api';

const initialInvite = { name: '', email: '', department: '', year: '', phone: '' };
const initialClub = { name: '', category: '', description: '', logo_url: '', coordinator_id: '' };
const initialSeason = { name: '', start_date: '', end_date: '', status: 'active', simultaneous_app_limit: '' };

const AdminUsers = () => {
    const [users, setUsers] = useState([]);
    const [clubs, setClubs] = useState([]);
    const [pendingRequests, setPendingRequests] = useState([]);
    const [seasons, setSeasons] = useState([]);
    const [query, setQuery] = useState('');
    const [role, setRole] = useState('');
    const [activeTab, setActiveTab] = useState('approvals');
    const [invite, setInvite] = useState(initialInvite);
    const [inviteUrl, setInviteUrl] = useState('');
    const [clubForm, setClubForm] = useState(initialClub);
    const [editingClubId, setEditingClubId] = useState(null);
    const [seasonForm, setSeasonForm] = useState(initialSeason);
    const [editingSeasonId, setEditingSeasonId] = useState(null);
    const [cloningSeason, setCloningSeason] = useState(null);
    const [cloneForm, setCloneForm] = useState({ name: '', start_date: '', end_date: '' });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    // Phase 10: Analytics & Funnel State
    const [selectedAnalyticsSeason, setSelectedAnalyticsSeason] = useState('');
    const [analyticsOverview, setAnalyticsOverview] = useState(null);
    const [funnelData, setFunnelData] = useState([]);
    const [demographicsData, setDemographicsData] = useState({ departments: [], years: [], total: 0 });
    const [clubsComparison, setClubsComparison] = useState([]);
    const [analyticsLoading, setAnalyticsLoading] = useState(false);

    // Phase 10: Data Privacy & Retention State
    const [deletionRequests, setDeletionRequests] = useState([]);
    const [retentionPolicies, setRetentionPolicies] = useState([]);
    const [retentionLogs, setRetentionLogs] = useState([]);
    const [privacyLoading, setPrivacyLoading] = useState(false);
    const [purging, setPurging] = useState(false);

    // Reject prompt state
    const [rejectingUser, setRejectingUser] = useState(null);
    const [rejectReason, setRejectReason] = useState('');

    const loadUsers = async () => {
        setLoading(true);
        setError('');
        try {
            const [userResponse, clubResponse, pendingResponse, seasonResponse] = await Promise.all([
                api.get('/admin/users', { params: { search: query, role: role || undefined, limit: 100 } }),
                api.get('/admin/clubs', { params: { limit: 100 } }),
                api.get('/admin/registration-requests'),
                api.get('/seasons', { params: { limit: 100 } })
            ]);
            setUsers(userResponse.data);
            setClubs(clubResponse.data);
            setPendingRequests(pendingResponse.data || []);
            setSeasons(seasonResponse.data || []);
        } catch (requestError) {
            setError(requestError.response?.data?.error || 'Unable to load administration data.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadUsers(); }, [query, role]);

    const loadAnalytics = async () => {
        setAnalyticsLoading(true);
        try {
            const params = selectedAnalyticsSeason ? { season_id: selectedAnalyticsSeason } : {};
            const [overviewRes, funnelRes, demoRes, clubsRes] = await Promise.all([
                api.get('/analytics/overview', { params }),
                api.get('/analytics/funnel', { params }),
                api.get('/analytics/demographics', { params }),
                api.get('/analytics/clubs-comparison', { params })
            ]);
            setAnalyticsOverview(overviewRes.data);
            setFunnelData(funnelRes.data.funnel || []);
            setDemographicsData(demoRes.data || { departments: [], years: [], total: 0 });
            setClubsComparison(clubsRes.data || []);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to load recruitment analytics');
        } finally {
            setAnalyticsLoading(false);
        }
    };

    const loadPrivacy = async () => {
        setPrivacyLoading(true);
        try {
            const [delRes, retRes] = await Promise.all([
                api.get('/privacy/delete-requests'),
                api.get('/privacy/retention/policies')
            ]);
            setDeletionRequests(delRes.data || []);
            setRetentionPolicies(retRes.data.policies || []);
            setRetentionLogs(retRes.data.recent_purges || []);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to load data privacy & retention records');
        } finally {
            setPrivacyLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'analytics') loadAnalytics();
        if (activeTab === 'privacy') loadPrivacy();
    }, [activeTab, selectedAnalyticsSeason]);

    const handleApproveDeletion = async (id) => {
        if (!window.confirm('Are you sure you want to approve this deletion request? The candidate profile will be permanently anonymized.')) return;
        setError('');
        setNotice('');
        try {
            await api.post(`/privacy/delete-requests/${id}/action`, { action: 'approve' });
            setNotice('Candidate profile successfully anonymized.');
            await loadPrivacy();
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to approve deletion request.');
        }
    };

    const handleRejectDeletion = async (id) => {
        const adminNotes = window.prompt('Enter reason for rejecting this deletion request:');
        if (adminNotes === null) return;
        setError('');
        setNotice('');
        try {
            await api.post(`/privacy/delete-requests/${id}/action`, { action: 'reject', admin_notes: adminNotes });
            setNotice('Deletion request rejected.');
            await loadPrivacy();
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to reject deletion request.');
        }
    };

    const handleUpdateRetentionDays = async (policyId, currentDays) => {
        const input = window.prompt('Enter new retention duration in days (7–3650):', currentDays);
        if (!input) return;
        const days = Number(input);
        if (isNaN(days) || days < 7 || days > 3650) {
            alert('Retention days must be a number between 7 and 3650.');
            return;
        }
        setError('');
        setNotice('');
        try {
            await api.put(`/privacy/retention/policies/${policyId}`, { retention_days: days });
            setNotice('Retention policy updated.');
            await loadPrivacy();
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to update retention policy.');
        }
    };

    const handleTriggerPurge = async (entityType) => {
        if (!window.confirm(`Run automated data retention purge for ${entityType || 'all entities'}? Older records will be removed.`)) return;
        setPurging(true);
        setError('');
        setNotice('');
        try {
            const res = await api.post('/privacy/retention/purge', entityType ? { entity_type: entityType } : {});
            setNotice(res.data.message || 'Retention purge completed.');
            await loadPrivacy();
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to execute retention purge.');
        } finally {
            setPurging(false);
        }
    };

    const handleDownloadAnalyticsCsv = async () => {
        setError('');
        try {
            const params = selectedAnalyticsSeason ? { season_id: selectedAnalyticsSeason } : {};
            const res = await api.get('/analytics/export/csv', { params, responseType: 'blob' });
            const blob = new Blob([res.data], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `recruitment_analytics_${selectedAnalyticsSeason || 'all'}.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            setNotice('Recruitment analytics CSV downloaded successfully.');
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to download analytics CSV.');
        }
    };

    const updateInvite = (event) => setInvite(current => ({ ...current, [event.target.name]: event.target.value }));
    const updateClubForm = (event) => setClubForm(current => ({ ...current, [event.target.name]: event.target.value }));

    const handleApprove = async (userId) => {
        setError('');
        setNotice('');
        try {
            await api.post(`/admin/registration-requests/${userId}/approve`);
            setNotice('Applicant approved successfully. Account activated.');
            await loadUsers();
        } catch (requestError) {
            setError(requestError.response?.data?.error || 'Unable to approve registration.');
        }
    };

    const handleReject = async (e) => {
        e.preventDefault();
        if (!rejectingUser) return;
        setError('');
        setNotice('');
        try {
            await api.post(`/admin/registration-requests/${rejectingUser.id}/reject`, {
                reason: rejectReason.trim() || 'Declined by administrator'
            });
            setNotice(`Registration for ${rejectingUser.name} has been rejected.`);
            setRejectingUser(null);
            setRejectReason('');
            await loadUsers();
        } catch (requestError) {
            setError(requestError.response?.data?.error || 'Unable to reject registration.');
        }
    };

    const saveClub = async (event) => {
        event.preventDefault();
        setError('');
        try {
            const payload = { ...clubForm, coordinator_id: clubForm.coordinator_id ? Number(clubForm.coordinator_id) : null };
            if (editingClubId) await api.put(`/admin/clubs/${editingClubId}`, payload);
            else await api.post('/admin/clubs', payload);
            setClubForm(initialClub);
            setEditingClubId(null);
            await loadUsers();
        } catch (requestError) {
            setError(requestError.response?.data?.error || 'Unable to save club.');
        }
    };

    const editClub = (club) => {
        setEditingClubId(club.id);
        setClubForm({
            name: club.name,
            category: club.category || '',
            description: club.description || '',
            logo_url: club.logo_url || '',
            coordinator_id: club.coordinator_id || ''
        });
        setActiveTab('clubs');
    };

    const archiveClub = async (club) => {
        if (!window.confirm(`Archive ${club.name}? Existing application history will be kept.`)) return;
        try {
            await api.delete(`/admin/clubs/${club.id}`, { data: { confirm: true } });
            await loadUsers();
        } catch (requestError) {
            setError(requestError.response?.data?.error || 'Unable to archive club.');
        }
    };

    const updateSeasonForm = (event) => setSeasonForm(current => ({ ...current, [event.target.name]: event.target.value }));

    const saveSeason = async (event) => {
        event.preventDefault();
        setError('');
        setNotice('');
        try {
            const payload = {
                name: seasonForm.name.trim(),
                start_date: seasonForm.start_date,
                end_date: seasonForm.end_date,
                status: seasonForm.status || 'upcoming',
                simultaneous_app_limit: seasonForm.simultaneous_app_limit ? Number(seasonForm.simultaneous_app_limit) : null
            };
            if (editingSeasonId) {
                await api.put(`/seasons/${editingSeasonId}`, payload);
                setNotice('Season updated successfully.');
            } else {
                await api.post('/seasons', payload);
                setNotice('New recruitment season created successfully.');
            }
            setSeasonForm(initialSeason);
            setEditingSeasonId(null);
            await loadUsers();
        } catch (requestError) {
            setError(requestError.response?.data?.error || 'Unable to save season.');
        }
    };

    const editSeason = (season) => {
        setEditingSeasonId(season.id);
        setSeasonForm({
            name: season.name,
            start_date: season.start_date,
            end_date: season.end_date,
            status: season.status,
            simultaneous_app_limit: season.simultaneous_app_limit || ''
        });
        setActiveTab('seasons');
    };

    const cancelEditSeason = () => {
        setEditingSeasonId(null);
        setSeasonForm(initialSeason);
    };

    const handleSeasonStatusChange = async (seasonId, newStatus) => {
        setError('');
        setNotice('');
        try {
            await api.patch(`/seasons/${seasonId}/status`, { status: newStatus });
            setNotice(`Season status changed to "${newStatus}".`);
            await loadUsers();
        } catch (requestError) {
            setError(requestError.response?.data?.error || 'Unable to update season status.');
        }
    };

    const handleCloneSeason = async (event) => {
        event.preventDefault();
        if (!cloningSeason) return;
        setError('');
        setNotice('');
        try {
            const res = await api.post(`/seasons/${cloningSeason.id}/clone`, cloneForm);
            setNotice(`Season cloned successfully with ${res.data.drives_cloned} draft drives.`);
            setCloningSeason(null);
            setCloneForm({ name: '', start_date: '', end_date: '' });
            await loadUsers();
        } catch (requestError) {
            setError(requestError.response?.data?.error || 'Unable to clone season.');
        }
    };

    const createInvite = async (event) => {
        event.preventDefault();
        setSaving(true);
        setError('');
        setNotice('');
        setInviteUrl('');
        try {
            const response = await api.post('/admin/coordinators/invites', { ...invite, year: Number(invite.year) });
            setInviteUrl(response.data.invite_url || '');
            setNotice(`Invite created. It expires ${new Date(response.data.expires_at).toLocaleString()}.`);
            setInvite(initialInvite);
        } catch (requestError) {
            setError(requestError.response?.data?.error || 'Unable to create coordinator invite.');
        } finally {
            setSaving(false);
        }
    };

    const setActive = async (user, isActive) => {
        setError('');
        try {
            await api.patch(`/admin/users/${user.id}/active`, { is_active: isActive });
            await loadUsers();
        } catch (requestError) {
            setError(requestError.response?.data?.error || 'Unable to update account.');
        }
    };

    const forceLogout = async (user) => {
        setError('');
        try {
            await api.post(`/admin/users/${user.id}/force-logout`);
            setNotice(`Sessions revoked for ${user.email}.`);
        } catch (requestError) {
            setError(requestError.response?.data?.error || 'Unable to revoke sessions.');
        }
    };

    const resetPassword = async (user) => {
        setError('');
        setNotice('');
        try {
            await api.post(`/admin/users/${user.id}/password-reset`);
            setNotice(`Password reset link sent to ${user.email}.`);
        } catch (requestError) {
            setError(requestError.response?.data?.error || 'Unable to send reset link.');
        }
    };

    return (
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            {/* Header */}
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Admin Control Center</h1>
                    <p className="mt-1 text-sm text-gray-600">Review pending registrations, provision coordinators, and manage platform clubs.</p>
                </div>
                <button
                    type="button"
                    onClick={loadUsers}
                    className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
                    aria-label="Refresh data"
                >
                    <RefreshCw size={15} /> Refresh
                </button>
            </div>

            {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">{error}</div>}
            {notice && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800" role="status">{notice}</div>}
            {inviteUrl && (
                <div className="mb-4 break-all rounded-xl border border-indigo-200 bg-indigo-50/70 p-4 text-sm text-indigo-900">
                    <span className="font-semibold block mb-1">Development Coordinator Invite Generated:</span>
                    <a className="font-medium underline hover:text-indigo-800" href={inviteUrl}>{inviteUrl}</a>
                </div>
            )}

            {/* Navigation Tabs */}
            <div className="flex border-b border-gray-200 mb-8 gap-2 overflow-x-auto whitespace-nowrap -mx-4 px-4 sm:mx-0 sm:px-0">
                <button
                    type="button"
                    onClick={() => setActiveTab('approvals')}
                    className={`py-3 px-4 font-semibold text-sm rounded-t-xl transition-all border-b-2 flex items-center gap-2 ${
                        activeTab === 'approvals'
                            ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50'
                            : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                    <ShieldCheck size={17} />
                    <span>Registration Approvals</span>
                    {pendingRequests.length > 0 ? (
                        <span className="ml-1.5 px-2 py-0.5 text-xs font-bold rounded-full bg-amber-500 text-white">
                            {pendingRequests.length}
                        </span>
                    ) : (
                        <span className="ml-1.5 px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">0</span>
                    )}
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('accounts')}
                    className={`py-3 px-4 font-semibold text-sm rounded-t-xl transition-all border-b-2 flex items-center gap-2 ${
                        activeTab === 'accounts'
                            ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50'
                            : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                    <Users size={17} />
                    <span>All Accounts ({users.length})</span>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('invite')}
                    className={`py-3 px-4 font-semibold text-sm rounded-t-xl transition-all border-b-2 flex items-center gap-2 ${
                        activeTab === 'invite'
                            ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50'
                            : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                    <UserPlus size={17} />
                    <span>Invite Coordinator</span>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('clubs')}
                    className={`py-3 px-4 font-semibold text-sm rounded-t-xl transition-all border-b-2 flex items-center gap-2 ${
                        activeTab === 'clubs'
                            ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50'
                            : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                    <Building size={17} />
                    <span>Club Directory ({clubs.length})</span>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('seasons')}
                    className={`py-3 px-4 font-semibold text-sm rounded-t-xl transition-all border-b-2 flex items-center gap-2 ${
                        activeTab === 'seasons'
                            ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50'
                            : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                    <CalendarDays size={17} />
                    <span>Recruitment Seasons ({seasons.length})</span>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('analytics')}
                    className={`py-3 px-4 font-semibold text-sm rounded-t-xl transition-all border-b-2 flex items-center gap-2 ${
                        activeTab === 'analytics'
                            ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50'
                            : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                    <BarChart3 size={17} />
                    <span>Analytics & Funnels</span>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('privacy')}
                    className={`py-3 px-4 font-semibold text-sm rounded-t-xl transition-all border-b-2 flex items-center gap-2 ${
                        activeTab === 'privacy'
                            ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50'
                            : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                    <ShieldAlert size={17} />
                    <span>Privacy & Retention</span>
                    {deletionRequests.filter(d => d.status === 'pending').length > 0 && (
                        <span className="ml-1 px-1.5 py-0.5 text-xs font-bold rounded-full bg-red-500 text-white">
                            {deletionRequests.filter(d => d.status === 'pending').length}
                        </span>
                    )}
                </button>
            </div>

            {/* TAB 1: Pending Registration Approvals */}
            {activeTab === 'approvals' && (
                <section>
                    <div className="mb-4 flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">Pending Student Registrations</h2>
                            <p className="text-xs text-gray-500">
                                Students who registered on the platform and are waiting for administrative review and clearance.
                            </p>
                        </div>
                    </div>

                    {loading ? (
                        <div className="py-12 text-center text-sm text-gray-500">Loading pending requests...</div>
                    ) : pendingRequests.length === 0 ? (
                        <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/50 py-16 text-center">
                            <ShieldCheck className="mx-auto h-12 w-12 text-gray-400 mb-3" />
                            <h3 className="text-base font-semibold text-gray-800">No Pending Requests</h3>
                            <p className="mt-1 text-sm text-gray-500 max-w-sm mx-auto">
                                All student registration requests have been reviewed. New applications will appear here in real-time.
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                            {pendingRequests.map(req => (
                                <div key={req.id} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
                                    <div className="flex items-start justify-between gap-3 mb-3">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-bold text-gray-900 text-base">{req.name}</h3>
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                                                    Pending
                                                </span>
                                            </div>
                                            <p className="text-xs text-gray-600 font-mono mt-0.5">{req.email}</p>
                                        </div>
                                        <div className="text-right text-xs text-gray-400">
                                            {new Date(req.created_at).toLocaleDateString()}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 text-xs bg-gray-50 rounded-xl p-3 mb-3 text-gray-700">
                                        <div>
                                            <span className="text-gray-400 block text-[11px]">Roll No / PRN:</span>
                                            <span className="font-semibold font-mono text-gray-900">{req.prn || '—'}</span>
                                        </div>
                                        <div>
                                            <span className="text-gray-400 block text-[11px]">Department:</span>
                                            <span className="font-semibold text-gray-900">{req.department || '—'}</span>
                                        </div>
                                        <div>
                                            <span className="text-gray-400 block text-[11px]">Year of Study:</span>
                                            <span className="font-semibold text-gray-900">{req.year ? `${req.year} Year` : '—'}</span>
                                        </div>
                                        <div>
                                            <span className="text-gray-400 block text-[11px]">Phone:</span>
                                            <span className="font-semibold text-gray-900">{req.phone || '—'}</span>
                                        </div>
                                    </div>

                                    {req.bio && (
                                        <div className="mb-4 text-xs bg-indigo-50/40 rounded-xl p-3 border border-indigo-100/50">
                                            <span className="font-semibold text-indigo-900 block mb-0.5">Statement / Bio:</span>
                                            <p className="text-gray-600 line-clamp-3">{req.bio}</p>
                                        </div>
                                    )}

                                    <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                                        <button
                                            type="button"
                                            onClick={() => handleApprove(req.id)}
                                            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 shadow-sm transition-colors cursor-pointer"
                                        >
                                            <Check size={14} /> Approve Access
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setRejectingUser(req);
                                                setRejectReason('');
                                            }}
                                            className="inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100 transition-colors cursor-pointer"
                                        >
                                            <X size={14} /> Reject
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            )}

            {/* TAB 2: All Accounts */}
            {activeTab === 'accounts' && (
                <section>
                    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">User Directory</h2>
                            <p className="text-xs text-gray-500">Manage all registered accounts, roles, access statuses, and sessions.</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <input
                                type="search"
                                placeholder="Search by name or email..."
                                value={query}
                                onChange={event => setQuery(event.target.value)}
                                className="rounded-xl border border-gray-300 px-3 py-1.5 text-xs bg-white focus:ring-indigo-500 focus:border-indigo-500"
                            />
                            <select
                                value={role}
                                onChange={event => setRole(event.target.value)}
                                className="rounded-xl border border-gray-300 px-3 py-1.5 text-xs bg-white focus:ring-indigo-500 focus:border-indigo-500"
                            >
                                <option value="">All Roles</option>
                                <option value="admin">Admin</option>
                                <option value="coordinator">Coordinator</option>
                                <option value="student">Student</option>
                            </select>
                        </div>
                    </div>

                    {loading ? (
                        <p className="py-8 text-sm text-gray-500">Loading accounts...</p>
                    ) : users.length === 0 ? (
                        <p className="py-8 text-sm text-gray-500">No accounts found matching your criteria.</p>
                    ) : (
                        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
                            <table className="min-w-full divide-y divide-gray-200 text-left text-xs">
                                <thead className="bg-gray-50 text-gray-600 font-semibold uppercase tracking-wider">
                                    <tr>
                                        <th className="px-4 py-3">Name & Email</th>
                                        <th className="px-4 py-3">PRN / Dept</th>
                                        <th className="px-4 py-3">Role</th>
                                        <th className="px-4 py-3">Approval</th>
                                        <th className="px-4 py-3">Status</th>
                                        <th className="px-4 py-3">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {users.map(u => (
                                        <tr key={u.id} className="hover:bg-gray-50/70 transition-colors">
                                            <td className="px-4 py-3">
                                                <div className="font-semibold text-gray-900">{u.name}</div>
                                                <div className="text-gray-500 font-mono text-[11px]">{u.email}</div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="font-mono text-gray-800">{u.prn || '—'}</div>
                                                <div className="text-gray-500 text-[11px]">{u.department || '—'}</div>
                                            </td>
                                            <td className="px-4 py-3 capitalize font-medium">{u.role}</td>
                                            <td className="px-4 py-3">
                                                {u.approval_status === 'pending' ? (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                                                        Pending
                                                    </span>
                                                ) : u.approval_status === 'rejected' ? (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800">
                                                        Rejected
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                                        Approved
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                                    u.is_active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-600'
                                                }`}>
                                                    {u.is_active ? 'Active' : 'Inactive'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex flex-wrap gap-1.5">
                                                    {u.approval_status === 'pending' && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleApprove(u.id)}
                                                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-300 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100"
                                                        >
                                                            <Check size={12} /> Approve
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => setActive(u, !u.is_active)}
                                                        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
                                                        title={u.is_active ? 'Deactivate account' : 'Reactivate account'}
                                                    >
                                                        {u.is_active ? <UserRoundX size={12} /> : <UserRoundCheck size={12} />}
                                                        {u.is_active ? 'Deactivate' : 'Activate'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => forceLogout(u)}
                                                        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
                                                    >
                                                        <RefreshCw size={12} /> Logout
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => resetPassword(u)}
                                                        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
                                                    >
                                                        <KeyRound size={12} /> Reset
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            )}

            {/* TAB 3: Invite Coordinator */}
            {activeTab === 'invite' && (
                <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm max-w-3xl">
                    <h2 className="text-lg font-bold text-gray-900 mb-1">Invite New Club Coordinator</h2>
                    <p className="text-xs text-gray-500 mb-6">
                        Generates a single-use, 48-hour activation link. Coordinators can create and manage recruitment drives for assigned clubs.
                    </p>

                    <form onSubmit={createInvite} className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                            Coordinator Name <span className="text-red-500">*</span>
                            <input
                                name="name"
                                required
                                value={invite.name}
                                onChange={updateInvite}
                                placeholder="e.g. Rahul Sharma"
                                className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm bg-gray-50 focus:bg-white focus:ring-indigo-500"
                            />
                        </label>

                        <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                            Email Address <span className="text-red-500">*</span>
                            <input
                                name="email"
                                type="email"
                                required
                                value={invite.email}
                                onChange={updateInvite}
                                placeholder="coordinator@example.com"
                                className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm bg-gray-50 focus:bg-white focus:ring-indigo-500"
                            />
                        </label>

                        <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                            Department <span className="text-red-500">*</span>
                            <input
                                name="department"
                                required
                                value={invite.department}
                                onChange={updateInvite}
                                placeholder="e.g. Computer Engineering"
                                className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm bg-gray-50 focus:bg-white focus:ring-indigo-500"
                            />
                        </label>

                        <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                            Year of Study <span className="text-red-500">*</span>
                            <select
                                name="year"
                                required
                                value={invite.year}
                                onChange={updateInvite}
                                className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm bg-gray-50 focus:bg-white focus:ring-indigo-500"
                            >
                                <option value="">Select year</option>
                                {[1, 2, 3, 4].map(val => (
                                    <option key={val} value={val}>{val} Year</option>
                                ))}
                            </select>
                        </label>

                        <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider md:col-span-2">
                            Phone Number
                            <input
                                name="phone"
                                type="tel"
                                value={invite.phone}
                                onChange={updateInvite}
                                placeholder="e.g. 9876543210"
                                className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm bg-gray-50 focus:bg-white focus:ring-indigo-500"
                            />
                        </label>

                        <div className="md:col-span-2 pt-2">
                            <button
                                disabled={saving}
                                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
                            >
                                <UserPlus size={16} /> {saving ? 'Creating Invite…' : 'Generate Coordinator Invite'}
                            </button>
                        </div>
                    </form>
                </section>
            )}

            {/* TAB 4: Club Directory */}
            {activeTab === 'clubs' && (
                <section>
                    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm mb-6">
                        <h2 className="text-lg font-bold text-gray-900 mb-1">{editingClubId ? 'Edit Club' : 'Create New Club'}</h2>
                        <p className="text-xs text-gray-500 mb-6">Define campus clubs and assign lead coordinators to manage recruitment drives.</p>

                        <form onSubmit={saveClub} className="grid grid-cols-1 gap-4 md:grid-cols-3">
                            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                                Club Name <span className="text-red-500">*</span>
                                <input
                                    name="name"
                                    required
                                    value={clubForm.name}
                                    onChange={updateClubForm}
                                    placeholder="e.g. Google Developer Student Clubs"
                                    className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm bg-gray-50 focus:bg-white focus:ring-indigo-500"
                                />
                            </label>

                            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                                Category
                                <input
                                    name="category"
                                    value={clubForm.category}
                                    onChange={updateClubForm}
                                    placeholder="e.g. Technical, Cultural, Sports"
                                    className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm bg-gray-50 focus:bg-white focus:ring-indigo-500"
                                />
                            </label>

                            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                                Lead Coordinator
                                <select
                                    name="coordinator_id"
                                    value={clubForm.coordinator_id}
                                    onChange={updateClubForm}
                                    className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm bg-gray-50 focus:bg-white focus:ring-indigo-500"
                                >
                                    <option value="">Unassigned</option>
                                    {users
                                        .filter(user => user.role === 'coordinator' && user.is_active)
                                        .map(user => (
                                            <option key={user.id} value={user.id}>{user.name} ({user.email})</option>
                                        ))}
                                </select>
                            </label>

                            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider md:col-span-3">
                                Description
                                <textarea
                                    name="description"
                                    rows={2}
                                    value={clubForm.description}
                                    onChange={updateClubForm}
                                    placeholder="Mission statement, activities, and expectations..."
                                    className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm bg-gray-50 focus:bg-white focus:ring-indigo-500"
                                />
                            </label>

                            <div className="md:col-span-3 flex items-center gap-2 pt-2">
                                <button className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors shadow-sm cursor-pointer">
                                    {editingClubId ? 'Save Club Changes' : 'Create Club'}
                                </button>
                                {editingClubId && (
                                    <button
                                        type="button"
                                        onClick={() => { setEditingClubId(null); setClubForm(initialClub); }}
                                        className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                                    >
                                        Cancel
                                    </button>
                                )}
                            </div>
                        </form>
                    </div>

                    <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
                        <table className="min-w-full divide-y divide-gray-200 text-left text-xs">
                            <thead className="bg-gray-50 text-gray-600 font-semibold uppercase tracking-wider">
                                <tr>
                                    <th className="px-4 py-3">Club Name</th>
                                    <th className="px-4 py-3">Category</th>
                                    <th className="px-4 py-3">Lead Coordinator</th>
                                    <th className="px-4 py-3">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {clubs.map(club => (
                                    <tr key={club.id} className="hover:bg-gray-50/70">
                                        <td className="px-4 py-3 font-semibold text-gray-900">{club.name}</td>
                                        <td className="px-4 py-3 text-gray-600">{club.category || 'General'}</td>
                                        <td className="px-4 py-3 text-gray-800">{club.coordinator_name || 'Unassigned'}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => editClub(club)}
                                                    className="rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => archiveClub(club)}
                                                    className="rounded-lg border border-red-200 px-2.5 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50"
                                                >
                                                    Archive
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            {/* TAB 5: Recruitment Seasons */}
            {activeTab === 'seasons' && (
                <section className="space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">Recruitment Seasons & Cycles</h2>
                            <p className="text-xs text-gray-500">
                                Seasons organise campus hiring rounds, set student application caps, and group club recruitment drives.
                            </p>
                        </div>
                    </div>

                    {/* Season Create / Edit Card */}
                    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                <CalendarDays size={18} className="text-indigo-600" />
                                <span>{editingSeasonId ? 'Edit Recruitment Season' : 'Open / Schedule New Season'}</span>
                            </h3>
                            {editingSeasonId && (
                                <button
                                    type="button"
                                    onClick={cancelEditSeason}
                                    className="text-xs font-semibold text-gray-500 hover:text-gray-700"
                                >
                                    Cancel Editing
                                </button>
                            )}
                        </div>

                        <form onSubmit={saveSeason} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                            <div className="lg:col-span-2">
                                <label className="block text-xs font-semibold text-gray-700 mb-1">
                                    Season Name *
                                </label>
                                <input
                                    required
                                    type="text"
                                    name="name"
                                    placeholder="e.g. Academic Year 2026–27 or Spring 2027"
                                    value={seasonForm.name}
                                    onChange={updateSeasonForm}
                                    className="w-full rounded-xl border border-gray-300 p-2.5 text-xs focus:border-indigo-500 focus:ring-indigo-500"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">
                                    Start Date *
                                </label>
                                <input
                                    required
                                    type="date"
                                    name="start_date"
                                    value={seasonForm.start_date}
                                    onChange={updateSeasonForm}
                                    className="w-full rounded-xl border border-gray-300 p-2.5 text-xs focus:border-indigo-500 focus:ring-indigo-500"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">
                                    End Date *
                                </label>
                                <input
                                    required
                                    type="date"
                                    name="end_date"
                                    value={seasonForm.end_date}
                                    onChange={updateSeasonForm}
                                    className="w-full rounded-xl border border-gray-300 p-2.5 text-xs focus:border-indigo-500 focus:ring-indigo-500"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">
                                    Lifecycle Status
                                </label>
                                <select
                                    name="status"
                                    value={seasonForm.status}
                                    onChange={updateSeasonForm}
                                    className="w-full rounded-xl border border-gray-300 p-2.5 text-xs focus:border-indigo-500 focus:ring-indigo-500"
                                >
                                    <option value="upcoming">Upcoming (Planning)</option>
                                    <option value="active">Active (Open for Hiring)</option>
                                    <option value="closed">Closed (Recruitment Done)</option>
                                    <option value="archived">Archived</option>
                                </select>
                            </div>

                            <div className="lg:col-span-3">
                                <label className="block text-xs font-semibold text-gray-700 mb-1">
                                    Simultaneous Application Limit Per Student
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    max="20"
                                    name="simultaneous_app_limit"
                                    placeholder="e.g. 3 (leave blank for unlimited)"
                                    value={seasonForm.simultaneous_app_limit}
                                    onChange={updateSeasonForm}
                                    className="w-full rounded-xl border border-gray-300 p-2.5 text-xs focus:border-indigo-500 focus:ring-indigo-500"
                                />
                                <span className="text-[11px] text-gray-500 mt-1 block">
                                    Caps how many concurrent active applications a single student can submit during this season.
                                </span>
                            </div>

                            <div className="lg:col-span-2 flex items-end">
                                <button
                                    type="submit"
                                    className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 transition"
                                >
                                    {editingSeasonId ? 'Update Season Details' : 'Create & Register Season'}
                                </button>
                            </div>
                        </form>
                    </div>

                    {/* Seasons Table / List */}
                    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                        <div className="border-b border-gray-100 bg-gray-50/75 px-6 py-3.5 flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">All Configured Seasons</span>
                            <span className="text-xs text-gray-500">{seasons.length} seasons total</span>
                        </div>

                        {seasons.length === 0 ? (
                            <div className="py-12 text-center text-sm text-gray-500">
                                No recruitment seasons found. Create your first season above.
                            </div>
                        ) : (
                            <table className="min-w-full divide-y divide-gray-200 text-left text-xs">
                                <thead className="bg-gray-50 text-gray-600 font-semibold">
                                    <tr>
                                        <th className="px-6 py-3">Season Name</th>
                                        <th className="px-6 py-3">Date Span</th>
                                        <th className="px-6 py-3">Status</th>
                                        <th className="px-6 py-3">App Limit</th>
                                        <th className="px-6 py-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {seasons.map(s => {
                                        const statusBadge = {
                                            active: 'bg-emerald-100 text-emerald-800 border-emerald-200',
                                            upcoming: 'bg-blue-100 text-blue-800 border-blue-200',
                                            closed: 'bg-gray-100 text-gray-700 border-gray-200',
                                            archived: 'bg-amber-100 text-amber-800 border-amber-200'
                                        }[s.status] || 'bg-gray-100 text-gray-700';

                                        return (
                                            <tr key={s.id} className="hover:bg-gray-50/60 transition">
                                                <td className="px-6 py-4">
                                                    <div className="font-bold text-gray-900 text-sm">{s.name}</div>
                                                    <div className="text-[11px] text-gray-500 font-mono mt-0.5">ID #{s.id}</div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="font-medium text-gray-800">{s.start_date}</div>
                                                    <div className="text-[11px] text-gray-500">to {s.end_date}</div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusBadge}`}>
                                                        {s.status}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    {s.simultaneous_app_limit ? (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 font-medium text-xs border border-purple-200">
                                                            Max {s.simultaneous_app_limit} apps
                                                        </span>
                                                    ) : (
                                                        <span className="text-gray-400">Unlimited</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-right whitespace-nowrap">
                                                    <div className="flex items-center justify-end gap-2">
                                                        {s.status !== 'active' ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleSeasonStatusChange(s.id, 'active')}
                                                                className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 transition"
                                                                title="Set as Active season"
                                                            >
                                                                Activate
                                                            </button>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleSeasonStatusChange(s.id, 'closed')}
                                                                className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-100 transition"
                                                                title="Close recruitment for this season"
                                                            >
                                                                Close
                                                            </button>
                                                        )}

                                                        <button
                                                            type="button"
                                                            onClick={() => editSeason(s)}
                                                            className="rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50 transition"
                                                        >
                                                            Edit
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setCloningSeason(s);
                                                                setCloneForm({
                                                                    name: `${s.name} (Next Cycle)`,
                                                                    start_date: '',
                                                                    end_date: ''
                                                                });
                                                            }}
                                                            className="rounded-lg border border-indigo-200 bg-indigo-50/50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100 transition flex items-center gap-1"
                                                            title="Clone all drives into a new season"
                                                        >
                                                            <Copy size={12} />
                                                            <span>Clone Drives</span>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </section>
            )}

            {/* TAB: Recruitment Analytics & Funnels */}
            {activeTab === 'analytics' && (
                <section className="space-y-6">
                    {/* Controls row */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
                        <div>
                            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                <BarChart3 className="text-indigo-600" size={20} />
                                Recruitment Analytics & Funnel Overview
                            </h2>
                            <p className="text-xs text-gray-500">
                                Cross-club recruitment funnel drop-offs, candidate demographics, and hiring velocity.
                            </p>
                        </div>
                        <div className="flex items-center gap-2.5">
                            <select
                                value={selectedAnalyticsSeason}
                                onChange={(e) => setSelectedAnalyticsSeason(e.target.value)}
                                className="rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700 focus:bg-white focus:outline-none"
                            >
                                <option value="">All Recruitment Seasons</option>
                                {seasons.map(s => (
                                    <option key={s.id} value={s.id}>{s.name} ({s.status})</option>
                                ))}
                            </select>

                            <button
                                type="button"
                                onClick={handleDownloadAnalyticsCsv}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 shadow-xs transition"
                            >
                                <Download size={14} className="text-emerald-600" />
                                <span>Export CSV</span>
                            </button>
                        </div>
                    </div>

                    {analyticsLoading ? (
                        <div className="py-16 text-center text-sm text-gray-500">Loading analytics insights...</div>
                    ) : (
                        <>
                            {/* Metric Cards Grid */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
                                    <span className="text-xs font-semibold text-gray-500">Total Drives</span>
                                    <p className="text-2xl font-bold text-gray-900 mt-1">{analyticsOverview?.total_drives ?? 0}</p>
                                </div>
                                <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
                                    <span className="text-xs font-semibold text-gray-500">Total Applications</span>
                                    <p className="text-2xl font-bold text-indigo-600 mt-1">{analyticsOverview?.total_applications ?? 0}</p>
                                </div>
                                <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
                                    <span className="text-xs font-semibold text-gray-500">Interviews Held</span>
                                    <p className="text-2xl font-bold text-purple-600 mt-1">{analyticsOverview?.total_interviewed ?? 0}</p>
                                </div>
                                <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
                                    <span className="text-xs font-semibold text-gray-500">Offers Accepted</span>
                                    <div className="flex items-baseline gap-1.5 mt-1">
                                        <p className="text-2xl font-bold text-emerald-600">{analyticsOverview?.total_accepted ?? 0}</p>
                                        <span className="text-xs text-gray-500">({analyticsOverview?.acceptance_rate ?? 0}% conv.)</span>
                                    </div>
                                </div>
                            </div>

                            {/* Funnel Progression Visualizer */}
                            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs">
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                            <TrendingUp size={16} className="text-indigo-600" />
                                            Recruitment Stage Funnel & Conversion Rates
                                        </h3>
                                        <p className="text-xs text-gray-500">Candidate progression and drop-offs through selection stages</p>
                                    </div>
                                    <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-indigo-50 text-indigo-700">
                                        Overall Conversion: {analyticsOverview?.acceptance_rate ?? 0}%
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                                    {funnelData.map(step => (
                                        <div key={step.stage} className="p-3.5 rounded-xl border border-gray-100 bg-gray-50/70 relative">
                                            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">{step.stage}</span>
                                            <p className="text-xl font-bold text-gray-900 mt-1">{step.count}</p>
                                            <div className="mt-2 text-[11px] space-y-0.5">
                                                <div className="flex justify-between text-gray-500">
                                                    <span>From prev:</span>
                                                    <span className="font-semibold text-indigo-600">{step.conversion_from_prev}%</span>
                                                </div>
                                                {step.drop_off_count > 0 && (
                                                    <div className="flex justify-between text-red-500">
                                                        <span>Drop-off:</span>
                                                        <span>-{step.drop_off_count}</span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2">
                                                <div
                                                    className="bg-indigo-600 h-1.5 rounded-full"
                                                    style={{ width: `${step.conversion_from_total || (step.count > 0 ? 100 : 0)}%` }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Demographics Row (2 cols) */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Department Breakdown */}
                                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs">
                                    <h3 className="text-sm font-bold text-gray-900 mb-1">Applicant Department Distribution</h3>
                                    <p className="text-xs text-gray-500 mb-4">Unique applicant volume across academic branches</p>

                                    {demographicsData.departments.length === 0 ? (
                                        <p className="text-xs text-gray-400 italic">No applicant department records found.</p>
                                    ) : (
                                        <div className="space-y-3">
                                            {demographicsData.departments.map(d => (
                                                <div key={d.department}>
                                                    <div className="flex justify-between text-xs mb-1">
                                                        <span className="font-semibold text-gray-700">{d.department}</span>
                                                        <span className="text-gray-500">{d.count} ({d.percentage}%)</span>
                                                    </div>
                                                    <div className="w-full bg-gray-100 rounded-full h-2">
                                                        <div className="bg-indigo-600 h-2 rounded-full" style={{ width: `${d.percentage}%` }} />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Year of Study Breakdown */}
                                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs">
                                    <h3 className="text-sm font-bold text-gray-900 mb-1">Academic Year Distribution</h3>
                                    <p className="text-xs text-gray-500 mb-4">Applicant distribution across classes</p>

                                    {demographicsData.years.length === 0 ? (
                                        <p className="text-xs text-gray-400 italic">No applicant year records found.</p>
                                    ) : (
                                        <div className="grid grid-cols-2 gap-3">
                                            {demographicsData.years.map(y => (
                                                <div key={y.year} className="p-3.5 rounded-xl border border-gray-100 bg-gray-50/70 text-center">
                                                    <span className="text-xs font-semibold text-gray-600">{y.label}</span>
                                                    <p className="text-xl font-bold text-indigo-700 mt-1">{y.count}</p>
                                                    <span className="text-[11px] text-gray-400 font-medium">{y.percentage}% of candidates</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Cross-Club Performance Comparison Table */}
                            <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
                                <div className="p-4 border-b border-gray-100">
                                    <h3 className="text-sm font-bold text-gray-900">Club Benchmark & Performance Comparison</h3>
                                    <p className="text-xs text-gray-500">Cross-club recruitment application volume and member conversion rates</p>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-200 text-left text-xs">
                                        <thead className="bg-gray-50 text-gray-600 font-semibold uppercase">
                                            <tr>
                                                <th className="px-6 py-3">Club Name</th>
                                                <th className="px-6 py-3">Category</th>
                                                <th className="px-6 py-3">Drives</th>
                                                <th className="px-6 py-3">Applications</th>
                                                <th className="px-6 py-3">Accepted</th>
                                                <th className="px-6 py-3">Active Roster</th>
                                                <th className="px-6 py-3 text-right">Acceptance Rate</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {clubsComparison.map(c => (
                                                <tr key={c.id} className="hover:bg-gray-50/70 transition">
                                                    <td className="px-6 py-3.5 font-bold text-gray-900">{c.name}</td>
                                                    <td className="px-6 py-3.5 text-gray-600">{c.category || 'General'}</td>
                                                    <td className="px-6 py-3.5 text-gray-700 font-semibold">{c.drives_count}</td>
                                                    <td className="px-6 py-3.5 text-indigo-600 font-semibold">{c.applications_count}</td>
                                                    <td className="px-6 py-3.5 text-emerald-600 font-semibold">{c.accepted_count}</td>
                                                    <td className="px-6 py-3.5 text-gray-700">{c.active_members_count}</td>
                                                    <td className="px-6 py-3.5 text-right font-bold text-gray-900">{c.acceptance_rate}%</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}
                </section>
            )}

            {/* TAB: Data Privacy & Retention */}
            {activeTab === 'privacy' && (
                <section className="space-y-6">
                    {/* Header */}
                    <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
                        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                            <ShieldAlert className="text-amber-600" size={20} />
                            Data Privacy, Subject Access & Retention Center
                        </h2>
                        <p className="text-xs text-gray-500">
                            DPDP/GDPR compliant right-to-be-forgotten deletion approvals and automated retention purge rules.
                        </p>
                    </div>

                    {privacyLoading ? (
                        <div className="py-16 text-center text-sm text-gray-500">Loading privacy controls...</div>
                    ) : (
                        <>
                            {/* Deletion / Anonymization Requests Queue */}
                            <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
                                <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                                    <div>
                                        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                            <Trash2 size={16} className="text-red-600" />
                                            Pending Student Deletion & Anonymization Requests
                                        </h3>
                                        <p className="text-xs text-gray-500">Candidate requests to permanently delete identifiable profile information</p>
                                    </div>
                                    <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
                                        {deletionRequests.filter(d => d.status === 'pending').length} Pending Review
                                    </span>
                                </div>

                                {deletionRequests.length === 0 ? (
                                    <div className="p-8 text-center text-xs text-gray-400">No account deletion requests have been submitted.</div>
                                ) : (
                                    <div className="divide-y divide-gray-100">
                                        {deletionRequests.map(req => (
                                            <div key={req.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:bg-gray-50/50 transition">
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-gray-900 text-sm">{req.user_name || 'Anonymized User'}</span>
                                                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                                                            req.status === 'pending'
                                                                ? 'bg-amber-100 text-amber-800'
                                                                : req.status === 'completed'
                                                                ? 'bg-emerald-100 text-emerald-800'
                                                                : 'bg-red-100 text-red-800'
                                                        }`}>
                                                            {req.status}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-gray-500 mt-0.5">{req.user_email} • {req.department} • Requested {new Date(req.requested_at).toLocaleDateString()}</p>
                                                    <p className="text-xs text-gray-700 mt-2 bg-gray-50 p-2.5 rounded-xl border border-gray-200/80">
                                                        <span className="font-semibold text-gray-800">Reason:</span> {req.reason}
                                                    </p>
                                                    {req.admin_notes && (
                                                        <p className="text-xs text-gray-500 mt-1 italic">
                                                            Reviewer note: {req.admin_notes}
                                                        </p>
                                                    )}
                                                </div>

                                                {req.status === 'pending' && (
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRejectDeletion(req.id)}
                                                            className="rounded-xl border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition shadow-xs"
                                                        >
                                                            Reject
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleApproveDeletion(req.id)}
                                                            className="rounded-xl bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 transition shadow-xs flex items-center gap-1.5"
                                                        >
                                                            <Trash2 size={13} />
                                                            <span>Approve & Anonymize</span>
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Data Retention Policies & Cleaner */}
                            <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
                                <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                    <div>
                                        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                            <Database size={16} className="text-indigo-600" />
                                            Data Retention Policies & Stale Log Cleaner
                                        </h3>
                                        <p className="text-xs text-gray-500">Configure automated data lifecycle purging for read notifications and old staging logs</p>
                                    </div>
                                    <button
                                        type="button"
                                        disabled={purging}
                                        onClick={() => handleTriggerPurge(null)}
                                        className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-700 transition shadow-xs disabled:opacity-60"
                                    >
                                        <Sliders size={14} />
                                        <span>{purging ? 'Purging…' : 'Run Retention Purge Now'}</span>
                                    </button>
                                </div>

                                <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-200 text-left text-xs">
                                        <thead className="bg-gray-50 text-gray-600 font-semibold uppercase">
                                            <tr>
                                                <th className="px-6 py-3">Entity Type</th>
                                                <th className="px-6 py-3">Retention Window</th>
                                                <th className="px-6 py-3">Status</th>
                                                <th className="px-6 py-3">Last Purged</th>
                                                <th className="px-6 py-3 text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {retentionPolicies.map(pol => (
                                                <tr key={pol.id} className="hover:bg-gray-50/70 transition">
                                                    <td className="px-6 py-3.5 font-bold text-gray-900 capitalize">{pol.entity_type.replace('_', ' ')}</td>
                                                    <td className="px-6 py-3.5">
                                                        <span className="font-semibold text-indigo-700">{pol.retention_days} Days</span>
                                                    </td>
                                                    <td className="px-6 py-3.5">
                                                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                                                            Active
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-3.5 text-gray-500">
                                                        {pol.last_purged_at ? new Date(pol.last_purged_at).toLocaleString() : 'Never'}
                                                    </td>
                                                    <td className="px-6 py-3.5 text-right">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleUpdateRetentionDays(pol.id, pol.retention_days)}
                                                            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 underline mr-3"
                                                        >
                                                            Edit Days
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleTriggerPurge(pol.entity_type)}
                                                            className="text-xs font-semibold text-gray-600 hover:text-gray-900 underline"
                                                        >
                                                            Purge
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Recent Purge Execution Logs */}
                                {retentionLogs.length > 0 && (
                                    <div className="p-4 bg-gray-50/60 border-t border-gray-100 text-xs">
                                        <h4 className="font-bold text-gray-700 mb-2">Recent Retention Purge Logs</h4>
                                        <div className="space-y-1 text-gray-600">
                                            {retentionLogs.slice(0, 5).map(log => (
                                                <div key={log.id} className="flex items-center justify-between py-1 border-b border-gray-100 last:border-0">
                                                    <span>Purged {log.records_purged} stale {log.entity_type} records</span>
                                                    <span className="text-gray-400">{new Date(log.purged_at).toLocaleString()}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </section>
            )}
            {cloningSeason && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
                    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-gray-200">
                        <div className="flex items-center gap-3 text-indigo-600 mb-3">
                            <div className="rounded-full bg-indigo-100 p-2">
                                <Copy size={22} />
                            </div>
                            <h3 className="text-base font-bold text-gray-900">Clone Season Drives</h3>
                        </div>
                        <p className="text-xs text-gray-600 mb-4">
                            Duplicating drives from <span className="font-semibold text-gray-800">{cloningSeason.name}</span>. This will copy all non-archived recruitment drives into a new upcoming season as drafts so clubs can adjust dates and rubrics for the new cycle.
                        </p>
                        <form onSubmit={handleCloneSeason} className="space-y-3">
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">
                                    New Season Name *
                                </label>
                                <input
                                    required
                                    type="text"
                                    value={cloneForm.name}
                                    onChange={(e) => setCloneForm(c => ({ ...c, name: e.target.value }))}
                                    placeholder="e.g. Academic Year 2027–28"
                                    className="w-full rounded-xl border border-gray-300 p-2.5 text-xs bg-gray-50 focus:bg-white focus:ring-indigo-500 focus:border-indigo-500"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                                        Start Date *
                                    </label>
                                    <input
                                        required
                                        type="date"
                                        value={cloneForm.start_date}
                                        onChange={(e) => setCloneForm(c => ({ ...c, start_date: e.target.value }))}
                                        className="w-full rounded-xl border border-gray-300 p-2 text-xs bg-gray-50 focus:bg-white focus:ring-indigo-500 focus:border-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                                        End Date *
                                    </label>
                                    <input
                                        required
                                        type="date"
                                        value={cloneForm.end_date}
                                        onChange={(e) => setCloneForm(c => ({ ...c, end_date: e.target.value }))}
                                        className="w-full rounded-xl border border-gray-300 p-2 text-xs bg-gray-50 focus:bg-white focus:ring-indigo-500 focus:border-indigo-500"
                                    />
                                </div>
                            </div>
                            <div className="mt-5 flex justify-end gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setCloningSeason(null)}
                                    className="rounded-xl border border-gray-300 px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 shadow-sm"
                                >
                                    Clone Drives & Create Season
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Reject Modal */}
            {rejectingUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
                    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-gray-200">
                        <div className="flex items-center gap-3 text-red-600 mb-3">
                            <div className="rounded-full bg-red-100 p-2">
                                <AlertCircle size={22} />
                            </div>
                            <h3 className="text-base font-bold text-gray-900">Decline Student Registration</h3>
                        </div>
                        <p className="text-xs text-gray-600 mb-4">
                            You are rejecting registration for <span className="font-semibold text-gray-800">{rejectingUser.name}</span> ({rejectingUser.email}). Please provide a brief reason for the student.
                        </p>
                        <form onSubmit={handleReject}>
                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                                Rejection Reason / Note
                                <textarea
                                    required
                                    rows={3}
                                    placeholder="e.g. PRN does not match college records, please re-register with valid roll number."
                                    value={rejectReason}
                                    onChange={(e) => setRejectReason(e.target.value)}
                                    className="mt-1 block w-full rounded-xl border border-gray-300 p-3 text-xs bg-gray-50 focus:bg-white focus:ring-red-500 focus:border-red-500"
                                />
                            </label>
                            <div className="mt-5 flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setRejectingUser(null)}
                                    className="rounded-xl border border-gray-300 px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 shadow-sm"
                                >
                                    Confirm Rejection
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </main>
    );
};

export default AdminUsers;
