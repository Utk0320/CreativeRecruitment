/**
 * pages/ClubMembers.jsx — Club Member Lifecycle & Management (Phase 9)
 *
 * Implements:
 * 1. Club Roster (Leads, Members, Alumni, Titles, Public Directory Visibility)
 * 2. Onboarding Checklists & Member Completion Tracking
 * 3. Club Events & Dynamic Anti-Forgery QR Attendance Check-In
 * 4. Verifiable Member Certificates & SHA-256 Credential Issuance
 * 5. Conflicts & Admin Permission Overrides
 *
 * Route: /coordinator/clubs/:clubId/members
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api';
import {
    Users, CheckSquare, Calendar, Award, ShieldAlert,
    UserPlus, Trash2, ArrowLeftRight, AlertCircle, ShieldCheck,
    ChevronLeft, Loader2, QrCode, ExternalLink, Plus, Check, Copy,
    Clock, MapPin, Eye, EyeOff, Edit3, X
} from 'lucide-react';

const Spinner = () => (
    <div className="flex items-center justify-center py-20 text-gray-400">
        <Loader2 size={32} className="animate-spin text-indigo-600" />
    </div>
);

const EmptyState = ({ icon: Icon = Users, title, message }) => (
    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white py-14 px-4 text-center">
        <Icon size={40} className="mb-3 text-gray-300" />
        <h4 className="text-sm font-bold text-gray-800">{title}</h4>
        <p className="mt-1 text-xs text-gray-500 max-w-sm">{message}</p>
    </div>
);

const ClubMembers = () => {
    const { clubId } = useParams();
    const { user } = useAuth();
    const navigate = useNavigate();

    const [club, setClub] = useState(null);
    const [members, setMembers] = useState([]);
    const [activeTab, setActiveTab] = useState('roster');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [actionError, setActionError] = useState('');
    const [busy, setBusy] = useState(false);

    // Roster Modals
    const [showAdd, setShowAdd] = useState(false);
    const [addForm, setAddForm] = useState({ user_id: '', role: 'member', title: 'Member' });
    const [showTransfer, setShowTransfer] = useState(false);
    const [transferTo, setTransferTo] = useState('');
    const [editingMember, setEditingMember] = useState(null);
    const [editForm, setEditForm] = useState({ title: '', role: 'member', status: 'active' });

    // Onboarding State
    const [onboardingTasks, setOnboardingTasks] = useState([]);
    const [onboardingOverview, setOnboardingOverview] = useState(null);
    const [showAddTask, setShowAddTask] = useState(false);
    const [taskForm, setTaskForm] = useState({ title: '', description: '', resource_url: '', due_days_after_join: 7, is_required: 1 });

    // Events State
    const [events, setEvents] = useState([]);
    const [showAddEvent, setShowAddEvent] = useState(false);
    const [eventForm, setEventForm] = useState({
        title: '', description: '', location: '', event_date: '', start_time: '10:00', end_time: '12:00', is_public: 1
    });
    const [selectedQrEvent, setSelectedQrEvent] = useState(null);
    const [attendeesEvent, setAttendeesEvent] = useState(null);
    const [attendeesList, setAttendeesList] = useState([]);
    const [manualUserId, setManualUserId] = useState('');

    // Certificates State
    const [certificates, setCertificates] = useState([]);
    const [showIssueCert, setShowIssueCert] = useState(false);
    const [certForm, setCertForm] = useState({
        user_id: '', title: 'Certificate of Active Membership', certificate_type: 'membership', issue_date: new Date().toISOString().slice(0, 10)
    });
    const [copiedHash, setCopiedHash] = useState('');

    // Conflicts State
    const [conflictTarget, setConflictTarget] = useState(null);
    const [conflictReason, setConflictReason] = useState('');

    const isAdmin = user?.role === 'admin';
    const selfMember = members.find(m => m.user_id === user?.id);
    const isLead = selfMember?.role === 'lead';
    const canManage = isAdmin || isLead;

    // Load main data
    const fetchClubData = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [clubRes, membersRes] = await Promise.all([
                api.get(`/clubs/${clubId}`),
                api.get(`/clubs/${clubId}/members`)
            ]);
            setClub(clubRes.data);
            setMembers(membersRes.data);
        } catch (err) {
            setError(err.response?.data?.error || 'Unable to load club details');
        } finally {
            setLoading(false);
        }
    }, [clubId]);

    // Load Lifecycle data for specific tabs
    const fetchLifecycleData = useCallback(async () => {
        if (!clubId) return;
        try {
            if (activeTab === 'onboarding') {
                const [tasksRes, overviewRes] = await Promise.all([
                    api.get(`/lifecycle/clubs/${clubId}/onboarding`),
                    canManage ? api.get(`/lifecycle/clubs/${clubId}/onboarding/members`) : Promise.resolve({ data: null })
                ]);
                setOnboardingTasks(tasksRes.data);
                if (overviewRes.data) setOnboardingOverview(overviewRes.data);
            } else if (activeTab === 'events') {
                const eventsRes = await api.get(`/lifecycle/clubs/${clubId}/events`);
                setEvents(eventsRes.data);
            } else if (activeTab === 'certificates') {
                const certsRes = await api.get(`/lifecycle/clubs/${clubId}/certificates`);
                setCertificates(certsRes.data);
            }
        } catch (err) {
            console.error('Lifecycle fetch error:', err);
        }
    }, [clubId, activeTab, canManage]);

    useEffect(() => { fetchClubData(); }, [fetchClubData]);
    useEffect(() => { fetchLifecycleData(); }, [fetchLifecycleData]);

    // ── Roster Handlers ────────────────────────────────────────────────────────

    const handleAddMember = async (e) => {
        e.preventDefault();
        setActionError('');
        setBusy(true);
        try {
            await api.post(`/clubs/${clubId}/members`, {
                user_id: Number(addForm.user_id),
                role: addForm.role,
                title: addForm.title.trim()
            });
            setShowAdd(false);
            setAddForm({ user_id: '', role: 'member', title: 'Member' });
            setNotice('Member added to roster successfully.');
            await fetchClubData();
        } catch (err) {
            setActionError(err.response?.data?.error || 'Failed to add member');
        } finally {
            setBusy(false);
        }
    };

    const handleEditMember = async (e) => {
        e.preventDefault();
        if (!editingMember) return;
        setActionError('');
        setBusy(true);
        try {
            await api.patch(`/clubs/${clubId}/members/${editingMember.user_id}`, editForm);
            setEditingMember(null);
            setNotice('Member details updated successfully.');
            await fetchClubData();
        } catch (err) {
            setActionError(err.response?.data?.error || 'Failed to update member');
        } finally {
            setBusy(false);
        }
    };

    const handleToggleVisibility = async () => {
        if (!selfMember) return;
        const newVis = selfMember.is_public === 1 ? 0 : 1;
        try {
            await api.patch(`/clubs/${clubId}/members/my/visibility`, { is_public: newVis });
            setNotice(`Your profile is now ${newVis === 1 ? 'public in the club roster' : 'hidden from public view'}.`);
            await fetchClubData();
        } catch (err) {
            setActionError(err.response?.data?.error || 'Failed to update visibility');
        }
    };

    const handleRemoveMember = async (member) => {
        if (!window.confirm(`Remove ${member.name} from ${club?.name}?`)) return;
        setActionError('');
        try {
            await api.delete(`/clubs/${clubId}/members/${member.user_id}`);
            setNotice(`${member.name} removed from roster.`);
            await fetchClubData();
        } catch (err) {
            setActionError(err.response?.data?.error || 'Failed to remove member');
        }
    };

    const handleTransferLead = async (e) => {
        e.preventDefault();
        if (!transferTo) return;
        setActionError('');
        setBusy(true);
        try {
            await api.post(`/clubs/${clubId}/members/transfer-lead`, { new_lead_user_id: Number(transferTo) });
            setShowTransfer(false);
            setNotice('Lead role transferred successfully.');
            await fetchClubData();
        } catch (err) {
            setActionError(err.response?.data?.error || 'Failed to transfer lead');
        } finally {
            setBusy(false);
        }
    };

    // ── Onboarding Handlers ────────────────────────────────────────────────────

    const handleCreateTask = async (e) => {
        e.preventDefault();
        setActionError('');
        try {
            await api.post(`/lifecycle/clubs/${clubId}/onboarding`, taskForm);
            setShowAddTask(false);
            setTaskForm({ title: '', description: '', resource_url: '', due_days_after_join: 7, is_required: 1 });
            setNotice('Onboarding task added.');
            await fetchLifecycleData();
        } catch (err) {
            setActionError(err.response?.data?.error || 'Failed to add onboarding task');
        }
    };

    const handleToggleTaskProgress = async (taskId) => {
        try {
            await api.post(`/lifecycle/clubs/${clubId}/onboarding/${taskId}/toggle`, {});
            await fetchLifecycleData();
        } catch (err) {
            setActionError(err.response?.data?.error || 'Failed to update progress');
        }
    };

    const handleDeleteTask = async (taskId) => {
        if (!window.confirm('Delete this onboarding checklist task?')) return;
        try {
            await api.delete(`/lifecycle/clubs/${clubId}/onboarding/${taskId}`);
            setNotice('Task deleted.');
            await fetchLifecycleData();
        } catch (err) {
            setActionError(err.response?.data?.error || 'Failed to delete task');
        }
    };

    // ── Event Handlers ─────────────────────────────────────────────────────────

    const handleCreateEvent = async (e) => {
        e.preventDefault();
        setActionError('');
        try {
            await api.post(`/lifecycle/clubs/${clubId}/events`, eventForm);
            setShowAddEvent(false);
            setEventForm({ title: '', description: '', location: '', event_date: '', start_time: '10:00', end_time: '12:00', is_public: 1 });
            setNotice('Event created successfully with check-in QR code.');
            await fetchLifecycleData();
        } catch (err) {
            setActionError(err.response?.data?.error || 'Failed to create event');
        }
    };

    const handleShowAttendees = async (event) => {
        setAttendeesEvent(event);
        try {
            const res = await api.get(`/lifecycle/events/${event.id}/attendance`);
            setAttendeesList(res.data);
        } catch (err) {
            setActionError('Failed to load attendees');
        }
    };

    const handleManualCheckIn = async (e) => {
        e.preventDefault();
        if (!manualUserId || !attendeesEvent) return;
        try {
            await api.post(`/lifecycle/events/${attendeesEvent.id}/attendance/manual`, { user_id: Number(manualUserId) });
            setManualUserId('');
            const res = await api.get(`/lifecycle/events/${attendeesEvent.id}/attendance`);
            setAttendeesList(res.data);
            setNotice('Attendance recorded manually.');
        } catch (err) {
            setActionError(err.response?.data?.error || 'Failed to mark attendance');
        }
    };

    // ── Certificate Handlers ───────────────────────────────────────────────────

    const handleIssueCertificate = async (e) => {
        e.preventDefault();
        setActionError('');
        try {
            const res = await api.post(`/lifecycle/clubs/${clubId}/certificates`, {
                user_id: Number(certForm.user_id),
                title: certForm.title.trim(),
                certificate_type: certForm.certificate_type,
                issue_date: certForm.issue_date
            });
            setShowIssueCert(false);
            setNotice(res.data.message || 'Certificate issued successfully.');
            await fetchLifecycleData();
        } catch (err) {
            setActionError(err.response?.data?.error || 'Failed to issue certificate');
        }
    };

    const handleCopyVerifyLink = (hash) => {
        const url = `${window.location.origin}/verify/${hash}`;
        navigator.clipboard.writeText(url);
        setCopiedHash(hash);
        setTimeout(() => setCopiedHash(''), 2500);
    };

    if (loading) return <Spinner />;

    if (error) {
        return (
            <div className="max-w-2xl mx-auto px-4 py-16 text-center">
                <AlertCircle size={40} className="text-red-500 mx-auto mb-4" />
                <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
                <p className="text-sm text-gray-600 mb-6">{error}</p>
                <button onClick={() => navigate('/coordinator/clubs')} className="rounded-xl bg-gray-900 px-4 py-2 text-sm text-white font-medium">
                    ← Back to My Clubs
                </button>
            </div>
        );
    }

    const nonLeadMembers = members.filter(m => m.role !== 'lead');

    return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* Header Breadcrumb */}
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <Link to="/coordinator/clubs" className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 mb-2">
                        <ChevronLeft size={16} /> Back to Clubs
                    </Link>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900">{club?.name}</h1>
                        <span className="rounded-full bg-indigo-50 border border-indigo-200 px-3 py-0.5 text-xs font-bold text-indigo-700">
                            {club?.category || 'Club'}
                        </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                        Manage club membership roster, new member onboarding, events attendance QR, and verified credentials.
                    </p>
                </div>

                {selfMember && (
                    <div className="flex items-center gap-2 bg-white rounded-2xl border border-gray-200 p-2 px-3 shadow-xs">
                        <span className="text-xs text-gray-500">My Public Visibility:</span>
                        <button
                            type="button"
                            onClick={handleToggleVisibility}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold transition ${
                                selfMember.is_public === 1
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                        >
                            {selfMember.is_public === 1 ? <Eye size={13} /> : <EyeOff size={13} />}
                            <span>{selfMember.is_public === 1 ? 'Public' : 'Hidden'}</span>
                        </button>
                    </div>
                )}
            </div>

            {/* Notification & Error Banners */}
            {notice && (
                <div className="mb-6 flex items-center justify-between rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-xs font-semibold text-emerald-800">
                    <span className="flex items-center gap-2"><Check size={16} /> {notice}</span>
                    <button onClick={() => setNotice('')} className="text-emerald-500 hover:text-emerald-700 font-bold">×</button>
                </div>
            )}
            {actionError && (
                <div className="mb-6 flex items-center justify-between rounded-2xl bg-red-50 border border-red-200 p-4 text-xs font-semibold text-red-800">
                    <span className="flex items-center gap-2"><AlertCircle size={16} /> {actionError}</span>
                    <button onClick={() => setActionError('')} className="text-red-500 hover:text-red-700 font-bold">×</button>
                </div>
            )}

            {/* Navigation Tabs */}
            <div className="flex border-b border-gray-200 mb-8 gap-2 overflow-x-auto whitespace-nowrap -mx-4 px-4 sm:mx-0 sm:px-0">
                <button
                    type="button"
                    onClick={() => setActiveTab('roster')}
                    className={`py-3 px-4 font-semibold text-sm rounded-t-xl transition-all border-b-2 flex items-center gap-2 ${
                        activeTab === 'roster'
                            ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50'
                            : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                    <Users size={17} />
                    <span>Club Roster ({members.length})</span>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('onboarding')}
                    className={`py-3 px-4 font-semibold text-sm rounded-t-xl transition-all border-b-2 flex items-center gap-2 ${
                        activeTab === 'onboarding'
                            ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50'
                            : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                    <CheckSquare size={17} />
                    <span>Onboarding Checklist</span>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('events')}
                    className={`py-3 px-4 font-semibold text-sm rounded-t-xl transition-all border-b-2 flex items-center gap-2 ${
                        activeTab === 'events'
                            ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50'
                            : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                    <Calendar size={17} />
                    <span>Events & QR Attendance</span>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('certificates')}
                    className={`py-3 px-4 font-semibold text-sm rounded-t-xl transition-all border-b-2 flex items-center gap-2 ${
                        activeTab === 'certificates'
                            ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50'
                            : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                    <Award size={17} />
                    <span>Member Certificates</span>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('conflicts')}
                    className={`py-3 px-4 font-semibold text-sm rounded-t-xl transition-all border-b-2 flex items-center gap-2 ${
                        activeTab === 'conflicts'
                            ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50'
                            : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                    <ShieldAlert size={17} />
                    <span>Conflicts & Permissions</span>
                </button>
            </div>

            {/* TAB 1: CLUB ROSTER */}
            {activeTab === 'roster' && (
                <section className="space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">Active Roster & Member Directory</h2>
                            <p className="text-xs text-gray-500">
                                Official roster of student members, team leads, core coordinators, and alumni.
                            </p>
                        </div>
                        {canManage && (
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowAdd(true)}
                                    className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 transition"
                                >
                                    <UserPlus size={15} /> Add Member
                                </button>
                                {isLead && nonLeadMembers.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setShowTransfer(true)}
                                        className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition"
                                    >
                                        <ArrowLeftRight size={15} /> Transfer Lead
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                        <table className="min-w-full divide-y divide-gray-200 text-left text-xs">
                            <thead className="bg-gray-50 text-gray-600 font-semibold">
                                <tr>
                                    <th className="px-6 py-3.5">Member Name</th>
                                    <th className="px-6 py-3.5">Designation / Title</th>
                                    <th className="px-6 py-3.5">Role</th>
                                    <th className="px-6 py-3.5">Status</th>
                                    <th className="px-6 py-3.5">Season Joined</th>
                                    {canManage && <th className="px-6 py-3.5 text-right">Actions</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {members.map(m => (
                                    <tr key={m.id} className="hover:bg-gray-50/60 transition">
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-gray-900 text-sm">{m.name}</div>
                                            <div className="text-[11px] text-gray-500 font-mono">{m.email}</div>
                                            <div className="text-[11px] text-gray-400 mt-0.5">
                                                {m.department ? `${m.department} • Year ${m.year}` : 'Student Member'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="font-semibold text-gray-800">{m.title || 'Member'}</span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                                m.role === 'lead' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-700'
                                            }`}>
                                                {m.role}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                                m.status === 'active'
                                                    ? 'bg-emerald-100 text-emerald-800'
                                                    : m.status === 'alumni'
                                                    ? 'bg-blue-100 text-blue-800'
                                                    : 'bg-gray-100 text-gray-600'
                                            }`}>
                                                {m.status || 'active'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-gray-600 font-medium">
                                            {m.joined_season_name || '—'}
                                        </td>
                                        {canManage && (
                                            <td className="px-6 py-4 text-right whitespace-nowrap">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setEditingMember(m);
                                                            setEditForm({ title: m.title || '', role: m.role || 'member', status: m.status || 'active' });
                                                        }}
                                                        className="rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50"
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveMember(m)}
                                                        className="rounded-lg border border-red-200 px-2.5 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50"
                                                    >
                                                        Remove
                                                    </button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            {/* TAB 2: ONBOARDING CHECKLIST */}
            {activeTab === 'onboarding' && (
                <section className="space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">Member Onboarding Checklist</h2>
                            <p className="text-xs text-gray-500">
                                Guided steps for new recruits: orientation tasks, repository setup, and communication channels.
                            </p>
                        </div>
                        {canManage && (
                            <button
                                type="button"
                                onClick={() => setShowAddTask(true)}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 transition"
                            >
                                <Plus size={15} /> Add Checklist Task
                            </button>
                        )}
                    </div>

                    {/* Tasks Checklist */}
                    <div className="space-y-3">
                        {onboardingTasks.length === 0 ? (
                            <EmptyState
                                icon={CheckSquare}
                                title="No Onboarding Tasks Configured"
                                message="Create orientation checklist tasks for your new club recruits."
                            />
                        ) : (
                            onboardingTasks.map(task => (
                                <div key={task.id} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xs flex items-start justify-between gap-4">
                                    <div className="flex items-start gap-3">
                                        <button
                                            type="button"
                                            onClick={() => handleToggleTaskProgress(task.id)}
                                            className={`mt-0.5 w-6 h-6 rounded-lg border flex items-center justify-center transition ${
                                                task.is_completed === 1
                                                    ? 'bg-emerald-600 border-emerald-600 text-white'
                                                    : 'border-gray-300 hover:border-indigo-400 bg-gray-50'
                                            }`}
                                        >
                                            {task.is_completed === 1 && <Check size={14} />}
                                        </button>
                                        <div>
                                            <h4 className={`text-sm font-bold ${task.is_completed === 1 ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                                                {task.title}
                                            </h4>
                                            {task.description && (
                                                <p className="text-xs text-gray-600 mt-1">{task.description}</p>
                                            )}
                                            <div className="flex items-center gap-3 text-[11px] text-gray-400 mt-2">
                                                <span>Complete within {task.due_days_after_join} days of joining</span>
                                                {task.resource_url && (
                                                    <a
                                                        href={task.resource_url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="font-semibold text-indigo-600 hover:underline flex items-center gap-1"
                                                    >
                                                        <ExternalLink size={11} /> Open Resource
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    {canManage && (
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteTask(task.id)}
                                            className="text-gray-400 hover:text-red-600 p-1 rounded-lg"
                                            title="Delete task"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>
                            ))
                        )}
                    </div>

                    {/* Member Onboarding Progress Overview (Coordinators) */}
                    {canManage && onboardingOverview && (
                        <div className="mt-8 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                            <div className="border-b border-gray-100 bg-gray-50/75 px-6 py-3.5 flex items-center justify-between">
                                <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">Member Completion Progress</span>
                                <span className="text-xs text-gray-500">{onboardingOverview.members.length} members tracked</span>
                            </div>
                            <table className="min-w-full divide-y divide-gray-200 text-left text-xs">
                                <thead className="bg-gray-50 text-gray-600 font-semibold">
                                    <tr>
                                        <th className="px-6 py-3">Member</th>
                                        <th className="px-6 py-3">Designation</th>
                                        <th className="px-6 py-3">Progress</th>
                                        <th className="px-6 py-3 text-right">Completion Rate</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {onboardingOverview.members.map(m => (
                                        <tr key={m.user_id} className="hover:bg-gray-50/60 transition">
                                            <td className="px-6 py-3.5">
                                                <div className="font-bold text-gray-900">{m.name}</div>
                                                <div className="text-[11px] text-gray-400">{m.email}</div>
                                            </td>
                                            <td className="px-6 py-3.5 text-gray-700">{m.title || 'Member'}</td>
                                            <td className="px-6 py-3.5">
                                                <div className="w-full bg-gray-200 rounded-full h-2 max-w-[140px] overflow-hidden">
                                                    <div
                                                        className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                                                        style={{ width: `${m.progress_percentage}%` }}
                                                    />
                                                </div>
                                            </td>
                                            <td className="px-6 py-3.5 text-right font-bold text-indigo-700">
                                                {m.completed_tasks_count} / {m.total_tasks} ({m.progress_percentage}%)
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            )}

            {/* TAB 3: EVENTS & ATTENDANCE QR */}
            {activeTab === 'events' && (
                <section className="space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">Club Activities & Attendance QR</h2>
                            <p className="text-xs text-gray-500">
                                Schedule orientations, technical workshops, and verify live attendee presence with secure anti-forgery QR codes.
                            </p>
                        </div>
                        {canManage && (
                            <button
                                type="button"
                                onClick={() => setShowAddEvent(true)}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 transition"
                            >
                                <Plus size={15} /> Create Event
                            </button>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {events.length === 0 ? (
                            <div className="md:col-span-2">
                                <EmptyState
                                    icon={Calendar}
                                    title="No Events Scheduled"
                                    message="Plan and publish club meetings or workshops with QR check-in."
                                />
                            </div>
                        ) : (
                            events.map(ev => (
                                <div key={ev.id} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xs hover:shadow-md transition">
                                    <div className="flex items-start justify-between gap-3 mb-2">
                                        <h3 className="font-bold text-gray-900 text-base">{ev.title}</h3>
                                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                            ev.is_public === 1 ? 'bg-indigo-50 text-indigo-700' : 'bg-gray-100 text-gray-700'
                                        }`}>
                                            {ev.is_public === 1 ? 'Open Campus' : 'Members Only'}
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-600 mb-4 line-clamp-2">{ev.description || 'No description provided.'}</p>

                                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 bg-gray-50 rounded-xl p-3 mb-4">
                                        <div className="flex items-center gap-1.5">
                                            <Calendar size={13} className="text-gray-400" />
                                            <span>{ev.event_date}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <Clock size={13} className="text-gray-400" />
                                            <span>{ev.start_time} - {ev.end_time}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 col-span-2">
                                            <MapPin size={13} className="text-gray-400" />
                                            <span className="truncate">{ev.location}</span>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                                        <div className="text-xs text-gray-500">
                                            <span className="font-bold text-gray-800">{ev.going_count || 0}</span> RSVPs • <span className="font-bold text-emerald-600">{ev.attendance_count || 0}</span> Attendees
                                        </div>
                                        {canManage && (
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedQrEvent(ev)}
                                                    className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                                                >
                                                    <QrCode size={13} /> Check-In QR
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleShowAttendees(ev)}
                                                    className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                                                >
                                                    Attendees
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </section>
            )}

            {/* TAB 4: MEMBER CERTIFICATES */}
            {activeTab === 'certificates' && (
                <section className="space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">Official Club Credentials & Certificates</h2>
                            <p className="text-xs text-gray-500">
                                Issue verifiable member credentials with SHA-256 cryptographic proof for resumes and LinkedIn.
                            </p>
                        </div>
                        {canManage && (
                            <button
                                type="button"
                                onClick={() => setShowIssueCert(true)}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 transition"
                            >
                                <Award size={15} /> Issue Certificate
                            </button>
                        )}
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                        {certificates.length === 0 ? (
                            <div className="py-14 text-center">
                                <Award size={36} className="text-gray-300 mx-auto mb-2" />
                                <h4 className="text-sm font-bold text-gray-700">No Certificates Issued Yet</h4>
                                <p className="text-xs text-gray-500 mt-1">Recognize member achievements and contribution milestones.</p>
                            </div>
                        ) : (
                            <table className="min-w-full divide-y divide-gray-200 text-left text-xs">
                                <thead className="bg-gray-50 text-gray-600 font-semibold">
                                    <tr>
                                        <th className="px-6 py-3">Recipient</th>
                                        <th className="px-6 py-3">Certificate Title</th>
                                        <th className="px-6 py-3">Type</th>
                                        <th className="px-6 py-3">Issue Date</th>
                                        <th className="px-6 py-3 text-right">Verification</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {certificates.map(cert => (
                                        <tr key={cert.id} className="hover:bg-gray-50/60 transition">
                                            <td className="px-6 py-3.5">
                                                <div className="font-bold text-gray-900">{cert.recipient_name}</div>
                                                <div className="text-[11px] text-gray-400 font-mono">{cert.recipient_email}</div>
                                            </td>
                                            <td className="px-6 py-3.5 font-semibold text-gray-800">{cert.title}</td>
                                            <td className="px-6 py-3.5">
                                                <span className="capitalize px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700">
                                                    {cert.certificate_type}
                                                </span>
                                            </td>
                                            <td className="px-6 py-3.5 text-gray-600">{cert.issue_date}</td>
                                            <td className="px-6 py-3.5 text-right whitespace-nowrap">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleCopyVerifyLink(cert.unique_credential_hash)}
                                                        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-50"
                                                    >
                                                        {copiedHash === cert.unique_credential_hash ? (
                                                            <><Check size={12} className="text-emerald-600" /> Copied</>
                                                        ) : (
                                                            <><Copy size={12} /> Copy Link</>
                                                        )}
                                                    </button>
                                                    <Link
                                                        to={`/verify/${cert.unique_credential_hash}`}
                                                        target="_blank"
                                                        className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 border border-indigo-200 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"
                                                    >
                                                        <ExternalLink size={12} /> Verify Seal
                                                    </Link>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </section>
            )}

            {/* TAB 5: CONFLICTS & PERMISSIONS (Phase 2 Legacy) */}
            {activeTab === 'conflicts' && (
                <section className="space-y-6">
                    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                        <h2 className="text-base font-bold text-gray-900 mb-1">Conflict of Interest Declarations</h2>
                        <p className="text-xs text-gray-500 mb-4">
                            Coordinators must declare conflicts of interest with applicants (e.g. relatives, close project partners).
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {members.map(m => (
                                <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => setConflictTarget(m)}
                                    className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                                >
                                    Declare conflict for {m.name}
                                </button>
                            ))}
                        </div>
                    </div>
                </section>
            )}

            {/* MODALS */}

            {/* Add Member Modal */}
            {showAdd && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
                    <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl border border-gray-200">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-base font-bold text-gray-900">Add Member to Club Roster</h3>
                            <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
                        </div>
                        <form onSubmit={handleAddMember} className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">User ID *</label>
                                <input
                                    required
                                    type="number"
                                    placeholder="Enter Student or Coordinator user ID"
                                    value={addForm.user_id}
                                    onChange={(e) => setAddForm(a => ({ ...a, user_id: e.target.value }))}
                                    className="w-full rounded-xl border border-gray-300 p-2.5 text-xs bg-gray-50 focus:bg-white"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Designation / Title</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Technical Head, Core Member, Designer"
                                    value={addForm.title}
                                    onChange={(e) => setAddForm(a => ({ ...a, title: e.target.value }))}
                                    className="w-full rounded-xl border border-gray-300 p-2.5 text-xs bg-gray-50 focus:bg-white"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Club Role</label>
                                <select
                                    value={addForm.role}
                                    onChange={(e) => setAddForm(a => ({ ...a, role: e.target.value }))}
                                    className="w-full rounded-xl border border-gray-300 p-2.5 text-xs bg-gray-50 focus:bg-white"
                                >
                                    <option value="member">Member</option>
                                    {(isAdmin || isLead) && <option value="lead">Lead</option>}
                                </select>
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                                <button type="button" onClick={() => setShowAdd(false)} className="rounded-xl border px-4 py-2 text-xs font-medium">Cancel</button>
                                <button type="submit" disabled={busy} className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white">Add Member</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Member Modal */}
            {editingMember && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
                    <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl border border-gray-200">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-base font-bold text-gray-900">Edit Member: {editingMember.name}</h3>
                            <button onClick={() => setEditingMember(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
                        </div>
                        <form onSubmit={handleEditMember} className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Title / Designation</label>
                                <input
                                    type="text"
                                    value={editForm.title}
                                    onChange={(e) => setEditForm(ef => ({ ...ef, title: e.target.value }))}
                                    className="w-full rounded-xl border border-gray-300 p-2.5 text-xs bg-gray-50 focus:bg-white"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Status</label>
                                <select
                                    value={editForm.status}
                                    onChange={(e) => setEditForm(ef => ({ ...ef, status: e.target.value }))}
                                    className="w-full rounded-xl border border-gray-300 p-2.5 text-xs bg-gray-50 focus:bg-white"
                                >
                                    <option value="active">Active Member</option>
                                    <option value="alumni">Alumni</option>
                                    <option value="resigned">Resigned</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Role</label>
                                <select
                                    value={editForm.role}
                                    onChange={(e) => setEditForm(ef => ({ ...ef, role: e.target.value }))}
                                    className="w-full rounded-xl border border-gray-300 p-2.5 text-xs bg-gray-50 focus:bg-white"
                                >
                                    <option value="member">Member</option>
                                    {(isAdmin || isLead) && <option value="lead">Lead</option>}
                                </select>
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                                <button type="button" onClick={() => setEditingMember(null)} className="rounded-xl border px-4 py-2 text-xs font-medium">Cancel</button>
                                <button type="submit" disabled={busy} className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white">Save Changes</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Check-In QR Modal */}
            {selectedQrEvent && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
                    <div className="w-full max-w-sm max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-8 shadow-2xl border border-gray-200 text-center">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-xs uppercase font-bold text-indigo-600">Event Check-In Code</span>
                            <button onClick={() => setSelectedQrEvent(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 mb-1">{selectedQrEvent.title}</h3>
                        <p className="text-xs text-gray-500 mb-6">Display this code for attendees to scan and verify presence.</p>

                        <div className="mx-auto w-52 h-52 bg-white rounded-2xl border-4 border-indigo-50 shadow-inner flex items-center justify-center p-2 mb-4">
                            <img
                                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(selectedQrEvent.qr_secret_token)}`}
                                alt="Check-in QR"
                                className="w-full h-full object-contain"
                            />
                        </div>
                        <div className="font-mono text-xs bg-gray-50 p-2.5 rounded-xl border border-gray-200 text-gray-600 mb-4 select-all">
                            Secret: {selectedQrEvent.qr_secret_token}
                        </div>
                        <button
                            type="button"
                            onClick={() => setSelectedQrEvent(null)}
                            className="w-full py-2.5 rounded-xl bg-gray-900 text-white text-xs font-semibold"
                        >
                            Done Displaying
                        </button>
                    </div>
                </div>
            )}

            {/* Event Attendees Drawer/Modal */}
            {attendeesEvent && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
                    <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl border border-gray-200">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-base font-bold text-gray-900">Attendance: {attendeesEvent.title}</h3>
                            <button onClick={() => setAttendeesEvent(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
                        </div>
                        <p className="text-xs text-gray-500 mb-4">{attendeesList.length} total students checked in.</p>

                        {/* Manual Check-in Form */}
                        <form onSubmit={handleManualCheckIn} className="flex gap-2 mb-4">
                            <input
                                required
                                type="number"
                                placeholder="Student User ID"
                                value={manualUserId}
                                onChange={(e) => setManualUserId(e.target.value)}
                                className="flex-1 rounded-xl border border-gray-300 p-2 text-xs bg-gray-50"
                            />
                            <button type="submit" className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white">
                                Manual Check-In
                            </button>
                        </form>

                        <div className="max-h-64 overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-xl">
                            {attendeesList.length === 0 ? (
                                <div className="py-8 text-center text-xs text-gray-400">No attendees checked in yet.</div>
                            ) : (
                                attendeesList.map(a => (
                                    <div key={a.id} className="p-3 flex items-center justify-between text-xs">
                                        <div>
                                            <span className="font-bold text-gray-800">{a.name}</span>
                                            <span className="text-gray-400 text-[11px] block">{a.email}</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="capitalize text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                                                {a.check_in_method}
                                            </span>
                                            <span className="text-[10px] text-gray-400 block mt-0.5">{new Date(a.checked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Create Event Modal */}
            {showAddEvent && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
                    <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl border border-gray-200">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-base font-bold text-gray-900">Schedule Club Event</h3>
                            <button onClick={() => setShowAddEvent(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
                        </div>
                        <form onSubmit={handleCreateEvent} className="space-y-3">
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Event Title *</label>
                                <input
                                    required
                                    type="text"
                                    placeholder="e.g. Orientation Session / Git Workshop"
                                    value={eventForm.title}
                                    onChange={(e) => setEventForm(ef => ({ ...ef, title: e.target.value }))}
                                    className="w-full rounded-xl border border-gray-300 p-2.5 text-xs bg-gray-50 focus:bg-white"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Location *</label>
                                <input
                                    required
                                    type="text"
                                    placeholder="e.g. Auditorium 2 or Lab 4"
                                    value={eventForm.location}
                                    onChange={(e) => setEventForm(ef => ({ ...ef, location: e.target.value }))}
                                    className="w-full rounded-xl border border-gray-300 p-2.5 text-xs bg-gray-50 focus:bg-white"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Event Date *</label>
                                <input
                                    required
                                    type="date"
                                    value={eventForm.event_date}
                                    onChange={(e) => setEventForm(ef => ({ ...ef, event_date: e.target.value }))}
                                    className="w-full rounded-xl border border-gray-300 p-2 text-xs bg-gray-50 focus:bg-white"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Start Time *</label>
                                    <input
                                        required
                                        type="time"
                                        value={eventForm.start_time}
                                        onChange={(e) => setEventForm(ef => ({ ...ef, start_time: e.target.value }))}
                                        className="w-full rounded-xl border border-gray-300 p-2 text-xs bg-gray-50 focus:bg-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">End Time *</label>
                                    <input
                                        required
                                        type="time"
                                        value={eventForm.end_time}
                                        onChange={(e) => setEventForm(ef => ({ ...ef, end_time: e.target.value }))}
                                        className="w-full rounded-xl border border-gray-300 p-2 text-xs bg-gray-50 focus:bg-white"
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                                <button type="button" onClick={() => setShowAddEvent(false)} className="rounded-xl border px-4 py-2 text-xs font-medium">Cancel</button>
                                <button type="submit" className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white">Create Event</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Issue Certificate Modal */}
            {showIssueCert && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
                    <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl border border-gray-200">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-base font-bold text-gray-900">Issue Member Certificate</h3>
                            <button onClick={() => setShowIssueCert(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
                        </div>
                        <form onSubmit={handleIssueCertificate} className="space-y-3">
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Recipient Member *</label>
                                <select
                                    required
                                    value={certForm.user_id}
                                    onChange={(e) => setCertForm(cf => ({ ...cf, user_id: e.target.value }))}
                                    className="w-full rounded-xl border border-gray-300 p-2.5 text-xs bg-gray-50 focus:bg-white"
                                >
                                    <option value="">Select a club member...</option>
                                    {members.map(m => (
                                        <option key={m.user_id} value={m.user_id}>{m.name} ({m.title || 'Member'})</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Certificate Title *</label>
                                <input
                                    required
                                    type="text"
                                    placeholder="e.g. Certificate of Active Membership / Excellence in Leadership"
                                    value={certForm.title}
                                    onChange={(e) => setCertForm(cf => ({ ...cf, title: e.target.value }))}
                                    className="w-full rounded-xl border border-gray-300 p-2.5 text-xs bg-gray-50 focus:bg-white"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Credential Type</label>
                                    <select
                                        value={certForm.certificate_type}
                                        onChange={(e) => setCertForm(cf => ({ ...cf, certificate_type: e.target.value }))}
                                        className="w-full rounded-xl border border-gray-300 p-2 text-xs bg-gray-50 focus:bg-white"
                                    >
                                        <option value="membership">Membership</option>
                                        <option value="merit">Merit & Honor</option>
                                        <option value="completion">Completion</option>
                                        <option value="lead">Leadership</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Issue Date *</label>
                                    <input
                                        required
                                        type="date"
                                        value={certForm.issue_date}
                                        onChange={(e) => setCertForm(cf => ({ ...cf, issue_date: e.target.value }))}
                                        className="w-full rounded-xl border border-gray-300 p-2 text-xs bg-gray-50 focus:bg-white"
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                                <button type="button" onClick={() => setShowIssueCert(false)} className="rounded-xl border px-4 py-2 text-xs font-medium">Cancel</button>
                                <button type="submit" className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white">Generate Credential</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Add Checklist Task Modal */}
            {showAddTask && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
                    <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl border border-gray-200">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-base font-bold text-gray-900">Add Onboarding Task</h3>
                            <button onClick={() => setShowAddTask(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
                        </div>
                        <form onSubmit={handleCreateTask} className="space-y-3">
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Task Title *</label>
                                <input
                                    required
                                    type="text"
                                    placeholder="e.g. Join Club Discord / Clone Git Repo"
                                    value={taskForm.title}
                                    onChange={(e) => setTaskForm(tf => ({ ...tf, title: e.target.value }))}
                                    className="w-full rounded-xl border border-gray-300 p-2.5 text-xs bg-gray-50 focus:bg-white"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Description</label>
                                <textarea
                                    rows={2}
                                    placeholder="Instructions for the new member..."
                                    value={taskForm.description}
                                    onChange={(e) => setTaskForm(tf => ({ ...tf, description: e.target.value }))}
                                    className="w-full rounded-xl border border-gray-300 p-2 text-xs bg-gray-50 focus:bg-white"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Resource URL (Optional)</label>
                                <input
                                    type="url"
                                    placeholder="https://discord.gg/... or https://github.com/..."
                                    value={taskForm.resource_url}
                                    onChange={(e) => setTaskForm(tf => ({ ...tf, resource_url: e.target.value }))}
                                    className="w-full rounded-xl border border-gray-300 p-2 text-xs bg-gray-50 focus:bg-white"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Days to Complete</label>
                                <input
                                    type="number"
                                    min={1}
                                    max={60}
                                    value={taskForm.due_days_after_join}
                                    onChange={(e) => setTaskForm(tf => ({ ...tf, due_days_after_join: Number(e.target.value) }))}
                                    className="w-full rounded-xl border border-gray-300 p-2 text-xs bg-gray-50 focus:bg-white"
                                />
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                                <button type="button" onClick={() => setShowAddTask(false)} className="rounded-xl border px-4 py-2 text-xs font-medium">Cancel</button>
                                <button type="submit" className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white">Save Task</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ClubMembers;
