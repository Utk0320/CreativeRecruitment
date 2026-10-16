import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from '../api';
import { API_ORIGIN } from '../api';
import {
    ArrowLeft, Award, Briefcase, Calendar, CheckCircle, Clock, Code2,
    Copy, Edit3, ExternalLink, FileText, GraduationCap, Mail, MessageSquare,
    Plus, Search, Sparkles, Trash2, UserRound, Users, X, Layers
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { notifyDataChanged, useDataSync } from '../hooks/useDataSync';
import KanbanBoard from '../components/KanbanBoard';

const emptyDrive = {
    title: '',
    description: '',
    eligibility: '',
    open_date: '',
    deadline: '',
    club_id: '',
    blind_review: 0,
    hide_scores_until_submitted: 0
};

const STATUS_BADGE = {
    draft:     'bg-gray-100 text-gray-700 border-gray-200',
    scheduled: 'bg-blue-100 text-blue-700 border-blue-200',
    published: 'bg-green-100 text-green-800 border-green-200',
    closed:    'bg-red-100 text-red-700 border-red-200',
    archived:  'bg-amber-100 text-amber-700 border-amber-200',
    open:      'bg-green-100 text-green-800 border-green-200'
};

const parseJsonSafe = (value, fallback = []) => {
    if (!value) return fallback;
    if (Array.isArray(value)) return value;
    try { return JSON.parse(value); } catch { return fallback; }
};

const CoordinatorDrives = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [drives, setDrives] = useState([]);
    const [clubs, setClubs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedDrive, setSelectedDrive] = useState(null);
    const [applications, setApplications] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [editingDrive, setEditingDrive] = useState(null);
    const [form, setForm] = useState(emptyDrive);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    const [savingNotes, setSavingNotes] = useState(null);
    const [profile, setProfile] = useState(null);
    const [profileLoading, setProfileLoading] = useState(false);
    const [profileError, setProfileError] = useState('');
    const [showProfile, setShowProfile] = useState(false);

    // Active detail tab ('applications' | 'qa')
    const [activeTab, setActiveTab] = useState('applications');

    // Rubric editor state
    const [rubric, setRubric] = useState([]);
    const rubricSum = rubric.reduce((s, r) => s + (Number(r.weight) || 0), 0);
    const [aiDrafting, setAiDrafting] = useState(false);

    // Q&A state
    const [qa, setQa] = useState([]);
    const [qaLoading, setQaLoading] = useState(false);
    const [qaAnswer, setQaAnswer] = useState({});
    const [qaSubmitting, setQaSubmitting] = useState(null);
    const [qaError, setQaError] = useState('');

    // Copy slug feedback
    const [copied, setCopied] = useState(false);

    // Phase 7: Interview Slots state
    const [slotsData, setSlotsData] = useState({ slots: [], bookings: [] });
    const [loadingSlots, setLoadingSlots] = useState(false);
    const [newSlot, setNewSlot] = useState({ start_time: '', end_time: '', location: 'MMCOE Room 204', capacity: 1 });
    const [savingSlot, setSavingSlot] = useState(false);

    // Phase 7: Assessment Builder state
    const [testForm, setTestForm] = useState({ title: '', description: '', duration_minutes: 45, questions: [], total_points: 100 });
    const [loadingTest, setLoadingTest] = useState(false);
    const [savingTest, setSavingTest] = useState(false);

    // Phase 7: Stage Broadcast state
    const [broadcastStage, setBroadcastStage] = useState('stage_test');
    const [broadcastSubject, setBroadcastSubject] = useState('Next Steps for MMCOE Recruitment');
    const [broadcastBody, setBroadcastBody] = useState('Dear {{student_name}},\n\nYou have advanced in {{drive_title}}.\nPlease review your dashboard for scheduled events.');
    const [broadcastPreview, setBroadcastPreview] = useState(null);
    const [sendingBroadcast, setSendingBroadcast] = useState(false);
    const [broadcastSuccess, setBroadcastSuccess] = useState('');

    // Phase 8: Appeals & Announcements state
    const [appeals, setAppeals] = useState([]);
    const [loadingAppeals, setLoadingAppeals] = useState(false);
    const [reviewingAppeal, setReviewingAppeal] = useState(null);
    const [appealNotes, setAppealNotes] = useState('');
    const [appealTargetStage, setAppealTargetStage] = useState('');
    const [appealActionError, setAppealActionError] = useState('');
    const [appealActionLoading, setAppealActionLoading] = useState(false);

    const [announcements, setAnnouncements] = useState([]);
    const [loadingAnnouncements, setLoadingAnnouncements] = useState(false);
    const [announcementTitle, setAnnouncementTitle] = useState('');
    const [announcementContent, setAnnouncementContent] = useState('');
    const [announcementAudience, setAnnouncementAudience] = useState('all');
    const [postingAnnouncement, setPostingAnnouncement] = useState(false);
    const [announcementMsg, setAnnouncementMsg] = useState('');

    const fetchDrives = useCallback(() => {
        axios.get('/coordinator/drives')
            .then(res => setDrives(res.data))
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        axios.get('/coordinator/clubs')
            .then(res => setClubs(res.data))
            .catch(err => console.error(err));
    }, []);

    useDataSync(fetchDrives);

    const fetchApplications = (driveId) => {
        axios.get(`/applications/drive/${driveId}`)
            .then(res => setApplications(res.data))
            .catch(err => setError(err.response?.data?.error || 'Unable to load applications'));
    };

    const fetchQA = (driveId) => {
        setQaLoading(true);
        setQaError('');
        axios.get(`/drives/${driveId}/qa`)
            .then(res => setQa(res.data))
            .catch(() => setQaError('Unable to load Q&A'))
            .finally(() => setQaLoading(false));
    };

    const fetchSlots = useCallback((driveId) => {
        if (!driveId) return;
        setLoadingSlots(true);
        axios.get(`/interviews/drive/${driveId}/slots`)
            .then(res => setSlotsData(res.data || { slots: [], bookings: [] }))
            .catch(err => console.error(err))
            .finally(() => setLoadingSlots(false));
    }, []);

    const handleCreateSlot = async (e) => {
        e.preventDefault();
        if (!selectedDrive || !newSlot.start_time || !newSlot.end_time) return;
        try {
            setSavingSlot(true);
            await axios.post(`/interviews/drive/${selectedDrive.id}/slots`, newSlot);
            setNewSlot({ start_time: '', end_time: '', location: 'MMCOE Room 204', capacity: 1 });
            fetchSlots(selectedDrive.id);
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to create slot');
        } finally {
            setSavingSlot(false);
        }
    };

    const handleCancelSlot = async (slotId) => {
        if (!window.confirm('Cancel this interview slot?')) return;
        try {
            await axios.delete(`/interviews/slots/${slotId}`);
            fetchSlots(selectedDrive.id);
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to cancel slot');
        }
    };

    const handleMarkNoShow = async (bookingId) => {
        if (!window.confirm('Mark this candidate as No Show?')) return;
        try {
            await axios.post(`/interviews/${bookingId}/no-show`);
            fetchSlots(selectedDrive.id);
            fetchApplications(selectedDrive.id);
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to record No Show');
        }
    };

    const fetchTest = useCallback((driveId) => {
        if (!driveId) return;
        setLoadingTest(true);
        axios.get(`/tests/drive/${driveId}`)
            .then(res => {
                if (res.data && res.data.title) {
                    setTestForm({
                        title: res.data.title,
                        description: res.data.description || '',
                        duration_minutes: res.data.duration_minutes || 45,
                        questions: res.data.questions || [],
                        total_points: res.data.total_points || 100
                    });
                } else {
                    setTestForm({
                        title: 'Technical Assessment',
                        description: 'Screening assessment for shortlisted applicants.',
                        duration_minutes: 45,
                        questions: [
                            { id: 'q1', type: 'mcq', prompt: 'Core technical or domain question...', options: ['Option A', 'Option B', 'Option C'], correct_option: 'Option A', points: 10 }
                        ],
                        total_points: 10
                    });
                }
            })
            .catch(err => console.error(err))
            .finally(() => setLoadingTest(false));
    }, []);

    const handleSaveTest = async (e) => {
        e.preventDefault();
        if (!selectedDrive) return;
        try {
            setSavingTest(true);
            await axios.post(`/tests/drive/${selectedDrive.id}`, testForm);
            alert('Assessment saved successfully!');
            fetchTest(selectedDrive.id);
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to save assessment');
        } finally {
            setSavingTest(false);
        }
    };

    const handlePreviewBroadcast = async () => {
        if (!selectedDrive) return;
        try {
            const res = await axios.post('/messages/broadcast/preview', {
                drive_id: selectedDrive.id,
                stage_id: broadcastStage,
                subject_template: broadcastSubject,
                body_template: broadcastBody
            });
            setBroadcastPreview(res.data);
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to generate preview');
        }
    };

    const handleSendBroadcast = async () => {
        if (!selectedDrive || !window.confirm(`Send this announcement to all applicants in stage "${broadcastStage}"?`)) return;
        try {
            setSendingBroadcast(true);
            const res = await axios.post('/messages/broadcast/send', {
                drive_id: selectedDrive.id,
                stage_id: broadcastStage,
                subject: broadcastSubject,
                body: broadcastBody
            });
            setBroadcastSuccess(res.data.message || 'Broadcast message sent!');
            setTimeout(() => setBroadcastSuccess(''), 4000);
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to send broadcast');
        } finally {
            setSendingBroadcast(false);
        }
    };

    const fetchAppeals = useCallback((clubId) => {
        if (!clubId) return;
        setLoadingAppeals(true);
        axios.get(`/appeals/club/${clubId}`)
            .then(res => setAppeals(res.data || []))
            .catch(err => console.error(err))
            .finally(() => setLoadingAppeals(false));
    }, []);

    const fetchAnnouncements = useCallback((clubId) => {
        if (!clubId) return;
        setLoadingAnnouncements(true);
        axios.get(`/announcements/club/${clubId}`)
            .then(res => setAnnouncements(res.data || []))
            .catch(err => console.error(err))
            .finally(() => setLoadingAnnouncements(false));
    }, []);

    const handleReviewAppeal = async (status) => {
        if (!reviewingAppeal) return;
        setAppealActionLoading(true);
        setAppealActionError('');
        try {
            await axios.post(`/appeals/${reviewingAppeal.id}/review`, {
                status,
                notes: appealNotes.trim() || undefined,
                restored_stage_id: status === 'Overturned' ? appealTargetStage : undefined
            });
            setReviewingAppeal(null);
            setAppealNotes('');
            fetchAppeals(selectedDrive?.club_id);
            if (selectedDrive) fetchApplications(selectedDrive.id);
        } catch (err) {
            setAppealActionError(err.response?.data?.error || 'Failed to review appeal');
        } finally {
            setAppealActionLoading(false);
        }
    };

    const handleCreateAnnouncement = async (e) => {
        e.preventDefault();
        if (!selectedDrive?.club_id || !announcementTitle.trim() || !announcementContent.trim()) return;
        setPostingAnnouncement(true);
        setAnnouncementMsg('');
        try {
            await axios.post('/announcements', {
                club_id: selectedDrive.club_id,
                title: announcementTitle.trim(),
                content: announcementContent.trim(),
                audience: announcementAudience
            });
            setAnnouncementTitle('');
            setAnnouncementContent('');
            setAnnouncementMsg('Announcement posted and dispatched to recipients!');
            fetchAnnouncements(selectedDrive.club_id);
            setTimeout(() => setAnnouncementMsg(''), 4000);
        } catch (err) {
            setAnnouncementMsg('Failed to post announcement: ' + (err.response?.data?.error || err.message));
        } finally {
            setPostingAnnouncement(false);
        }
    };

    const selectedClubId = searchParams.get('club_id');
    const filteredDrives = useMemo(
        () => selectedClubId
            ? drives.filter(drive => String(drive.club_id) === selectedClubId)
            : drives,
        [drives, selectedClubId]
    );
    const selectedClubName = clubs.find(club => String(club.id) === selectedClubId)?.name
        || filteredDrives[0]?.club_name
        || 'All clubs';

    useEffect(() => {
        if (!selectedClubId || !filteredDrives.length) return;
        const firstDrive = filteredDrives[0];
        setSelectedDrive(firstDrive);
        setShowProfile(false);
        setProfile(null);
        fetchApplications(firstDrive.id);
        fetchQA(firstDrive.id);
        fetchSlots(firstDrive.id);
        fetchTest(firstDrive.id);
    }, [selectedClubId, filteredDrives, fetchSlots, fetchTest]);

    const openCreate = async () => {
        setEditingDrive(null);
        setForm({ ...emptyDrive, open_date: new Date().toISOString().split('T')[0] });
        setRubric([
            { criterion: 'Technical Skills', description: 'Core domain and development knowledge', weight: 40 },
            { criterion: 'Communication', description: 'Articulation and collaborative fit', weight: 30 },
            { criterion: 'Problem Solving', description: 'Analytical approach and creativity', weight: 30 }
        ]);
        setError('');
        try {
            const response = await axios.get('/coordinator/clubs');
            setClubs(response.data);
            setForm(current => ({ ...current, club_id: response.data[0]?.id || '' }));
        } catch (err) {
            setError(err.response?.data?.error || 'Unable to load clubs');
            return;
        }
        setShowForm(true);
    };

    const openEdit = (drive) => {
        setEditingDrive(drive);
        setForm({
            title: drive.title,
            description: drive.description,
            eligibility: drive.eligibility || '',
            open_date: drive.open_date?.split('T')[0] || drive.open_date,
            deadline: drive.deadline?.split('T')[0] || drive.deadline,
            club_id: drive.club_id,
            blind_review: drive.blind_review ? 1 : 0,
            hide_scores_until_submitted: drive.hide_scores_until_submitted ? 1 : 0
        });
        setRubric(parseJsonSafe(drive.rubric, []));
        setClubs([{ id: drive.club_id, name: drive.club_name || selectedDrive?.club_name || 'Selected club' }]);
        setShowForm(true);
        setError('');
    };

    const addRubricItem = () => {
        setRubric(current => [...current, { criterion: '', description: '', weight: 0 }]);
    };

    const updateRubricItem = (index, field, value) => {
        setRubric(current => current.map((item, i) => i === index ? { ...item, [field]: value } : item));
    };

    const removeRubricItem = (index) => {
        setRubric(current => current.filter((_, i) => i !== index));
    };

    const handleAiDraftRubric = async () => {
        setAiDrafting(true);
        setError('');
        try {
            const clubObj = clubs.find(c => String(c.id) === String(form.club_id));
            const res = await axios.post('/ai/draft-rubric', {
                category: clubObj?.category || 'technical',
                description: form.description || form.eligibility,
                role_title: form.title
            });
            if (res.data?.criteria && res.data.criteria.length > 0) {
                setRubric(res.data.criteria);
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to auto-draft rubric with AI');
        } finally {
            setAiDrafting(false);
        }
    };

    const handleDriveSubmit = async (event) => {
        event.preventDefault();
        if (rubric.length > 0 && rubricSum !== 100) {
            setError(`Rubric weights must sum to 100% (currently ${rubricSum}%)`);
            return;
        }
        setSaving(true);
        setError('');
        try {
            const payload = {
                ...form,
                club_id: form.club_id,
                rubric: rubric.length > 0 ? rubric.map(r => ({ ...r, weight: Number(r.weight) })) : undefined
            };
            if (editingDrive) {
                await axios.put(`/drives/${editingDrive.id}`, payload);
            } else {
                await axios.post('/drives', payload);
            }
            notifyDataChanged();
            setShowForm(false);
            await fetchDrives();
        } catch (err) {
            setError(err.response?.data?.error || 'Unable to save drive');
        } finally {
            setSaving(false);
        }
    };

    const updateDriveStatus = async (drive, status) => {
        if (!window.confirm(`Transition "${drive.title}" to ${status}?`)) return;
        try {
            await axios.patch(`/drives/${drive.id}/status`, { status });
            notifyDataChanged();
            await fetchDrives();
            if (selectedDrive?.id === drive.id) {
                setSelectedDrive(prev => ({ ...prev, status }));
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Unable to update drive status');
        }
    };

    const cloneDrive = async (drive) => {
        try {
            await axios.post(`/drives/${drive.id}/clone`);
            notifyDataChanged();
            await fetchDrives();
        } catch (err) {
            setError(err.response?.data?.error || 'Unable to duplicate drive');
        }
    };

    const submitAnswer = async (driveId, qaId) => {
        const answer = (qaAnswer[qaId] || '').trim();
        if (!answer) return;
        setQaSubmitting(qaId);
        try {
            await axios.put(`/drives/${driveId}/qa/${qaId}/answer`, { answer });
            setQaAnswer(prev => ({ ...prev, [qaId]: '' }));
            fetchQA(driveId);
        } catch (err) {
            setQaError(err.response?.data?.error || 'Unable to post answer');
        } finally {
            setQaSubmitting(null);
        }
    };

    const copySlug = (slug) => {
        const url = `${window.location.origin}/apply/${slug}`;
        navigator.clipboard.writeText(url).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const deleteDrive = async (drive) => {
        if (!window.confirm(`Archive "${drive.title}"? Its application history will be retained.`)) return;
        try {
            await axios.delete(`/drives/${drive.id}`, { data: { confirm: true } });
            notifyDataChanged();
            await fetchDrives();
            if (selectedDrive?.id === drive.id) {
                setSelectedDrive(null);
                setApplications([]);
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Unable to delete drive');
        }
    };

    const updateStatus = async (appId, status) => {
        try {
            await axios.put(`/applications/${appId}`, { status });
            notifyDataChanged();
            await fetchApplications(selectedDrive.id);
        } catch (err) {
            setError(err.response?.data?.error || 'Unable to update application status');
        }
    };

    const saveNotes = async (appId) => {
        const application = applications.find(item => item.id === appId);
        if (!application) return;
        setSavingNotes(appId);
        try {
            await axios.put(`/applications/${appId}/notes`, { notes: application.notes });
            setSavingNotes(null);
        } catch (err) {
            setError(err.response?.data?.error || 'Unable to save application notes');
            setSavingNotes(null);
        }
    };

    const openProfile = async (application) => {
        setProfileLoading(true);
        setProfileError('');
        setProfile(null);
        try {
            const response = await axios.get(`/applications/${application.id}/profile`);
            setProfile({ ...response.data, application });
            setShowProfile(true);
        } catch (err) {
            setProfileError(err.response?.data?.error || 'Unable to load student profile');
        } finally {
            setProfileLoading(false);
        }
    };

    const closeProfile = () => {
        setShowProfile(false);
        window.setTimeout(() => setProfile(null), 320);
    };

    const filteredApplications = applications.filter(app => {
        const query = search.trim().toLowerCase();
        const matchesSearch = !query || [app.student_name, app.email, app.department, app.drive_title, app.motivation, app.notes]
            .filter(Boolean).some(value => value.toLowerCase().includes(query));
        const matchesStatus = statusFilter === 'All' || app.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    if (loading) return <div className="p-8 text-center text-gray-500">Loading drives...</div>;

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Manage Drives</h1>
                    <p className="text-gray-600 mt-2">Create recruitment drives, configure evaluation rubrics, and review applicants.</p>
                    {selectedClubId && (
                        <div className="mt-3 inline-flex items-center rounded-full bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-200">
                            Club: {selectedClubName}
                        </div>
                    )}
                </div>
                <button
                    onClick={openCreate}
                    className="flex items-center space-x-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                >
                    <Plus size={20} />
                    <span>Create New Drive</span>
                </button>
            </div>

            {error && <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

            {showForm && (
                <form onSubmit={handleDriveSubmit} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
                    <div className="flex items-center justify-between mb-5">
                        <h2 className="text-xl font-bold text-gray-900">{editingDrive ? 'Edit Recruitment Drive' : 'Create Recruitment Drive'}</h2>
                        <button type="button" onClick={() => setShowForm(false)} aria-label="Close form"><X size={20} /></button>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                            <input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" placeholder="e.g. Frontend Developer Fall 2026" />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                            <textarea required value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" rows="3"></textarea>
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Eligibility Criteria</label>
                            <input required value={form.eligibility} onChange={e => setForm({ ...form, eligibility: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" placeholder="Required skills or qualifications" />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Club</label>
                            <select required value={form.club_id} onChange={e => setForm({ ...form, club_id: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none">
                                {clubs.length === 0 && <option value="">No clubs available</option>}
                                {clubs.map(club => <option key={club.id} value={club.id}>{club.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Open Date</label>
                            <input type="date" required value={form.open_date} onChange={e => setForm({ ...form, open_date: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Deadline</label>
                            <input type="date" required min={form.open_date} value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
                        </div>

                        {/* Rubric Editor */}
                        <div className="md:col-span-2 border-t border-gray-200 pt-4 mt-2">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                                <div>
                                    <h3 className="text-sm font-bold text-gray-900">Evaluation Rubric</h3>
                                    <p className="text-xs text-gray-500">Define weighted scoring criteria for reviewing applications. Total weight must equal 100%.</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${rubricSum === 100 ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-amber-100 text-amber-800 border border-amber-200'}`}>
                                        Total Weight: {rubricSum}% {rubricSum === 100 ? '✓' : '(Must sum to 100%)'}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={handleAiDraftRubric}
                                        disabled={aiDrafting}
                                        className="inline-flex items-center gap-1 text-xs font-semibold text-purple-700 hover:text-purple-900 px-2.5 py-1 rounded bg-purple-50 hover:bg-purple-100 border border-purple-200 transition-colors disabled:opacity-50"
                                        title="Use AI to generate a balanced 100% weighted rubric based on the role and club category"
                                    >
                                        <Sparkles size={13} className={aiDrafting ? 'animate-spin' : ''} />
                                        {aiDrafting ? 'Drafting...' : 'AI Draft Rubric'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={addRubricItem}
                                        className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 px-2.5 py-1 rounded bg-indigo-50 hover:bg-indigo-100 transition-colors"
                                    >
                                        <Plus size={14} /> Add Criterion
                                    </button>
                                </div>
                            </div>

                            {rubric.length === 0 ? (
                                <p className="text-xs text-gray-400 bg-gray-50 p-3 rounded-lg text-center">No rubric criteria added. Click "Add Criterion" to define structured scoring.</p>
                            ) : (
                                <div className="space-y-2">
                                    {rubric.map((item, idx) => (
                                        <div key={idx} className="flex items-start gap-2 bg-gray-50 p-2.5 rounded-lg border border-gray-200">
                                            <div className="flex-1 grid grid-cols-1 sm:grid-cols-12 gap-2">
                                                <div className="sm:col-span-4">
                                                    <input
                                                        required
                                                        value={item.criterion}
                                                        onChange={e => updateRubricItem(idx, 'criterion', e.target.value)}
                                                        placeholder="Criterion Name (e.g. Coding)"
                                                        className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded bg-white focus:ring-1 focus:ring-indigo-500 outline-none"
                                                    />
                                                </div>
                                                <div className="sm:col-span-6">
                                                    <input
                                                        value={item.description || ''}
                                                        onChange={e => updateRubricItem(idx, 'description', e.target.value)}
                                                        placeholder="Description / Guide (optional)"
                                                        className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded bg-white focus:ring-1 focus:ring-indigo-500 outline-none"
                                                    />
                                                </div>
                                                <div className="sm:col-span-2 flex items-center gap-1">
                                                    <input
                                                        type="number"
                                                        required
                                                        min="1"
                                                        max="100"
                                                        value={item.weight}
                                                        onChange={e => updateRubricItem(idx, 'weight', e.target.value === '' ? '' : Number(e.target.value))}
                                                        className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded bg-white focus:ring-1 focus:ring-indigo-500 outline-none"
                                                    />
                                                    <span className="text-xs text-gray-500 font-semibold">%</span>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => removeRubricItem(idx)}
                                                className="text-gray-400 hover:text-red-500 p-1"
                                                aria-label="Remove criterion"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Collaboration & Evaluation Settings */}
                        <div className="md:col-span-2 border-t border-gray-200 pt-4 mt-2">
                            <h3 className="text-sm font-bold text-gray-900 mb-1">Collaboration & Review Settings</h3>
                            <p className="text-xs text-gray-500 mb-3">Configure fairness, anonymity, and anti-anchoring controls for the review panel.</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <label className="flex items-start gap-2.5 p-3 rounded-lg border border-gray-200 bg-gray-50/50 hover:bg-gray-50 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={Boolean(form.blind_review)}
                                        onChange={e => setForm({ ...form, blind_review: e.target.checked ? 1 : 0 })}
                                        className="mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <div>
                                        <span className="text-xs font-bold text-gray-900 block">Blind Review Mode</span>
                                        <span className="text-[11px] text-gray-500 leading-tight block mt-0.5">
                                            Redacts candidate name and contact details for non-admin reviewers to minimize evaluation bias.
                                        </span>
                                    </div>
                                </label>

                                <label className="flex items-start gap-2.5 p-3 rounded-lg border border-gray-200 bg-gray-50/50 hover:bg-gray-50 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={Boolean(form.hide_scores_until_submitted)}
                                        onChange={e => setForm({ ...form, hide_scores_until_submitted: e.target.checked ? 1 : 0 })}
                                        className="mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <div>
                                        <span className="text-xs font-bold text-gray-900 block">Mask Scores (Anti-Anchoring)</span>
                                        <span className="text-[11px] text-gray-500 leading-tight block mt-0.5">
                                            Hides other reviewers' scorecards until a reviewer submits their own independent score.
                                        </span>
                                    </div>
                                </label>
                            </div>
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 mt-5">
                        <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
                        <button type="submit" disabled={saving} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-60">{saving ? 'Saving...' : editingDrive ? 'Save Changes' : 'Save Drive'}</button>
                    </div>
                </form>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Drives List */}
                <div className="lg:col-span-1 space-y-4">
                    <h2 className="text-xl font-bold text-gray-900 mb-4">Your Drives</h2>
                    {selectedClubId && (
                        <button
                            onClick={() => setSearchParams({})}
                            className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                        >
                            <ArrowLeft size={13} /> View all clubs
                        </button>
                    )}
                    {filteredDrives.length === 0 ? (
                        <p className="text-gray-500 bg-gray-50 p-4 rounded-lg text-center">No drives for this club. Create one to get started.</p>
                    ) : (
                        filteredDrives.map(drive => (
                            <div 
                                key={drive.id}
                                onClick={() => {
                                    setSelectedDrive(drive);
                                    setShowProfile(false);
                                    setProfile(null);
                                    fetchApplications(drive.id);
                                    fetchQA(drive.id);
                                }}
                                className={`p-4 rounded-xl cursor-pointer transition-all border ${selectedDrive?.id === drive.id ? 'bg-indigo-50 border-indigo-300 ring-1 ring-indigo-500' : 'bg-white border-gray-200 hover:border-indigo-300 shadow-sm'}`}
                            >
                                <div className="flex justify-between items-start mb-2 gap-2">
                                    <h3 className={`font-semibold ${selectedDrive?.id === drive.id ? 'text-indigo-900' : 'text-gray-900'}`}>{drive.title}</h3>
                                    <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold capitalize border ${STATUS_BADGE[drive.status] || 'bg-gray-100 text-gray-800'}`}>
                                        {drive.status}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between text-sm text-gray-500 gap-3">
                                    <div className="flex items-center space-x-1">
                                        <Calendar size={14} />
                                        <span>{drive.deadline?.split('T')[0] || drive.deadline}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={e => { e.stopPropagation(); cloneDrive(drive); }}
                                            className="p-1.5 rounded-md text-gray-500 hover:bg-indigo-50 hover:text-indigo-600"
                                            title="Duplicate drive"
                                            aria-label={`Duplicate ${drive.title}`}
                                        >
                                            <Copy size={15} />
                                        </button>
                                        <button
                                            onClick={e => { e.stopPropagation(); openEdit(drive); }}
                                            className="p-1.5 rounded-md text-gray-500 hover:bg-indigo-50 hover:text-indigo-600"
                                            title="Edit drive"
                                            aria-label={`Edit ${drive.title}`}
                                        >
                                            <Edit3 size={15} />
                                        </button>
                                        <button
                                            onClick={e => { e.stopPropagation(); deleteDrive(drive); }}
                                            className="p-1.5 rounded-md text-gray-500 hover:bg-red-50 hover:text-red-600"
                                            title="Archive drive"
                                            aria-label={`Archive ${drive.title}`}
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Drive Detail & Applications / Q&A View */}
                <div className="lg:col-span-2">
                    {selectedDrive && (
                        showProfile && profile ? (
                            <div className="profile-page-enter bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                                <section className="relative overflow-hidden bg-gradient-to-br from-indigo-700 via-indigo-600 to-violet-600 px-6 py-8 text-white sm:px-8">
                                    <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
                                    <div className="absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-violet-400/20 blur-3xl" />
                                    <button onClick={closeProfile} className="relative z-10 inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20">
                                        <ArrowLeft size={16} /> Back to applications
                                    </button>
                                    <div className="relative z-10 mt-7 flex flex-col items-start gap-5 sm:flex-row sm:items-center">
                                        {profile.profile_picture_url ? (
                                            <img src={`${API_ORIGIN}${profile.profile_picture_url}`} alt={profile.name} className="h-28 w-28 rounded-2xl border-4 border-white/20 object-cover shadow-xl" />
                                        ) : (
                                            <div className="flex h-28 w-28 items-center justify-center rounded-2xl border-4 border-white/20 bg-white/10 text-3xl font-bold shadow-xl">{profile.name.split(' ').map(part => part[0]).join('').slice(0, 2)}</div>
                                        )}
                                        <div>
                                            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-100">Student profile</p>
                                            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{profile.name}</h2>
                                            <p className="mt-2 text-sm text-indigo-100">{profile.department} · {profile.year ? `${profile.year}${profile.year === 1 ? 'st' : profile.year === 2 ? 'nd' : profile.year === 3 ? 'rd' : 'th'} Year` : 'Year not set'}</p>
                                            <div className="mt-4 flex flex-wrap gap-2">
                                                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur">{profile.club_name}</span>
                                                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur">{profile.drive_title}</span>
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                <div className="p-6 sm:p-8">
                                    {profileError && <p className="mb-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">{profileError}</p>}
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
                                            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Contact</p>
                                            <div className="mt-3 flex items-start gap-3 text-sm text-gray-700"><Mail size={17} className="mt-0.5 shrink-0 text-indigo-500" /> {profile.email}</div>
                                            <div className="mt-2 flex items-start gap-3 text-sm text-gray-700"><GraduationCap size={17} className="mt-0.5 shrink-0 text-indigo-500" /> {profile.phone || 'Phone not provided'}</div>
                                        </div>
                                        <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
                                            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Application details</p>
                                            <p className="mt-3 text-sm font-semibold text-gray-900">{profile.drive_title}</p>
                                            <p className="mt-1 text-sm text-gray-600">{profile.club_name} · {profile.application?.status || 'Applied'}</p>
                                        </div>
                                    </div>

                                    <section className="mt-7 rounded-xl border border-gray-200 p-5">
                                        <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900"><UserRound size={18} className="text-indigo-600" /> About the student</h3>
                                        <p className="mt-3 whitespace-pre-line text-sm leading-7 text-gray-600">{profile.bio || 'No bio has been added yet.'}</p>
                                    </section>

                                    <div className="mt-7 grid gap-6 md:grid-cols-2">
                                        <section>
                                            <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900"><Code2 size={18} className="text-indigo-600" /> Skills</h3>
                                            <div className="mt-4 flex flex-wrap gap-2">{parseJsonSafe(profile.skills).length ? parseJsonSafe(profile.skills).map((skill, index) => <span key={index} className="rounded-full bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700">{skill}</span>) : <p className="text-sm text-gray-500">No skills listed.</p>}</div>
                                        </section>
                                        <section>
                                            <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900"><Award size={18} className="text-indigo-600" /> Achievements</h3>
                                            <ul className="mt-4 space-y-3">{parseJsonSafe(profile.achievements).length ? parseJsonSafe(profile.achievements).map((achievement, index) => <li key={index} className="flex gap-2 text-sm text-gray-600"><CheckCircle size={16} className="mt-0.5 shrink-0 text-green-500" /> {achievement}</li>) : <p className="text-sm text-gray-500">No achievements listed.</p>}</ul>
                                        </section>
                                    </div>

                                    <section className="mt-7">
                                        <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900"><Briefcase size={18} className="text-indigo-600" /> Projects</h3>
                                        <div className="mt-4 space-y-3">{parseJsonSafe(profile.projects).length ? parseJsonSafe(profile.projects).map((project, index) => (
                                            <article key={index} className="rounded-xl border border-gray-200 p-5 transition hover:border-indigo-200 hover:bg-indigo-50/30">
                                                <div className="flex items-start justify-between gap-4">
                                                    <div><h4 className="font-semibold text-gray-900">{project.name}</h4><p className="mt-1 text-sm font-medium text-indigo-600">{project.technologies}</p></div>
                                                    {project.link && <a href={project.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600"><ExternalLink size={14} /> View</a>}
                                                </div>
                                                <p className="mt-3 text-sm leading-6 text-gray-600">{project.description || 'No project description provided.'}</p>
                                            </article>
                                        )) : <p className="text-sm text-gray-500">No projects listed.</p>}</div>
                                    </section>

                                    <div className="mt-7 flex flex-wrap gap-3 border-t border-gray-100 pt-6">
                                        {profile.portfolio_url && <a href={profile.portfolio_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"><ExternalLink size={15} /> Portfolio</a>}
                                        {profile.github_url && <a href={profile.github_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50">GitHub</a>}
                                        {profile.linkedin_url && <a href={profile.linkedin_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50">LinkedIn</a>}
                                    </div>
                                </div>
                            </div>
                        ) : profileLoading ? (
                            <div className="profile-page-enter rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
                                <div className="h-28 w-28 animate-pulse rounded-2xl bg-gray-200" />
                                <div className="mt-6 h-8 w-64 max-w-full animate-pulse rounded bg-gray-200" />
                                <div className="mt-3 h-5 w-48 animate-pulse rounded bg-gray-100" />
                                <div className="mt-8 grid gap-4 sm:grid-cols-2"><div className="h-24 animate-pulse rounded-xl bg-gray-100" /><div className="h-24 animate-pulse rounded-xl bg-gray-100" /></div>
                            </div>
                        ) : (
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                                {/* Drive Header with Status Transitions & Shareable Link */}
                                <div className="bg-gray-50 border-b border-gray-200 p-6">
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                        <div>
                                            <div className="flex items-center gap-3">
                                                <h2 className="text-xl font-bold text-gray-900">{selectedDrive.title}</h2>
                                                <span className={`text-xs px-2.5 py-1 rounded-full font-semibold capitalize border ${STATUS_BADGE[selectedDrive.status] || 'bg-gray-100 text-gray-800'}`}>
                                                    {selectedDrive.status}
                                                </span>
                                            </div>
                                            <p className="text-sm text-gray-500 mt-1">
                                                {selectedClubName} · Deadline: {selectedDrive.deadline?.split('T')[0] || selectedDrive.deadline}
                                            </p>
                                        </div>

                                        {/* Status transition & duplicate buttons */}
                                        <div className="flex flex-wrap items-center gap-2">
                                            {selectedDrive.status === 'draft' && (
                                                <button
                                                    onClick={() => updateDriveStatus(selectedDrive, 'published')}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
                                                >
                                                    <CheckCircle size={14} /> Publish Drive
                                                </button>
                                            )}
                                            {selectedDrive.status === 'scheduled' && (
                                                <button
                                                    onClick={() => updateDriveStatus(selectedDrive, 'published')}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
                                                >
                                                    <CheckCircle size={14} /> Publish Now
                                                </button>
                                            )}
                                            {(selectedDrive.status === 'published' || selectedDrive.status === 'open') && (
                                                <button
                                                    onClick={() => updateDriveStatus(selectedDrive, 'closed')}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
                                                >
                                                    <Clock size={14} /> Close Drive
                                                </button>
                                            )}
                                            {selectedDrive.status === 'closed' && (
                                                <button
                                                    onClick={() => updateDriveStatus(selectedDrive, 'archived')}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
                                                >
                                                    <Trash2 size={14} /> Archive Drive
                                                </button>
                                            )}
                                            <button
                                                onClick={() => cloneDrive(selectedDrive)}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-semibold transition-colors"
                                            >
                                                <Copy size={14} /> Duplicate
                                            </button>
                                        </div>
                                    </div>

                                    {/* Shareable Link & QR Banner */}
                                    {selectedDrive.shareable_slug && (
                                        <div className="mt-4 pt-4 border-t border-gray-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white/70 p-3 rounded-lg border border-gray-200/60">
                                            <div className="flex items-center gap-3">
                                                <img
                                                    src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(`${window.location.origin}/apply/${selectedDrive.shareable_slug}`)}&size=80x80`}
                                                    alt="Drive QR Code"
                                                    className="w-12 h-12 rounded border border-gray-200 bg-white p-0.5 shadow-sm shrink-0"
                                                />
                                                <div className="min-w-0">
                                                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">Shareable Link & QR</span>
                                                    <span className="text-xs font-mono text-indigo-600 truncate block">
                                                        {`${window.location.origin}/apply/${selectedDrive.shareable_slug}`}
                                                    </span>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => copySlug(selectedDrive.shareable_slug)}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold transition-colors shrink-0"
                                            >
                                                <Copy size={13} /> {copied ? 'Copied Link!' : 'Copy Link'}
                                            </button>
                                        </div>
                                    )}

                                    {/* Tab Navigation */}
                                    <div className="overflow-x-auto -mx-6 px-6 mt-5 border-b border-gray-200 -mb-6">
                                        <div className="flex gap-4 whitespace-nowrap">
                                        <button
                                            onClick={() => setActiveTab('applications')}
                                            className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
                                                activeTab === 'applications'
                                                    ? 'border-indigo-600 text-indigo-600'
                                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                                            }`}
                                        >
                                            Applications ({applications.length})
                                        </button>
                                        <button
                                            onClick={() => setActiveTab('pipeline')}
                                            className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                                                activeTab === 'pipeline'
                                                    ? 'border-indigo-600 text-indigo-600'
                                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                                            }`}
                                        >
                                            <Layers size={15} /> Pipeline / Kanban
                                        </button>
                                        <button
                                            onClick={() => { setActiveTab('interviews'); fetchSlots(selectedDrive?.id); }}
                                            className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                                                activeTab === 'interviews'
                                                    ? 'border-indigo-600 text-indigo-600'
                                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                                            }`}
                                        >
                                            <Calendar size={15} /> Interviews ({slotsData.slots?.length || 0})
                                        </button>
                                        <button
                                            onClick={() => { setActiveTab('tests'); fetchTest(selectedDrive?.id); }}
                                            className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                                                activeTab === 'tests'
                                                    ? 'border-indigo-600 text-indigo-600'
                                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                                            }`}
                                        >
                                            <FileText size={15} /> Assessment Builder
                                        </button>
                                        <button
                                            onClick={() => setActiveTab('broadcast')}
                                            className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                                                activeTab === 'broadcast'
                                                    ? 'border-indigo-600 text-indigo-600'
                                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                                            }`}
                                        >
                                            <Mail size={15} /> Stage Broadcast
                                        </button>
                                        <button
                                            onClick={() => setActiveTab('qa')}
                                            className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                                                activeTab === 'qa'
                                                    ? 'border-indigo-600 text-indigo-600'
                                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                                            }`}
                                        >
                                            <MessageSquare size={15} /> Q&A ({qa.length})
                                        </button>
                                        <button
                                            onClick={() => { setActiveTab('appeals'); fetchAppeals(selectedDrive?.club_id); }}
                                            className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                                                activeTab === 'appeals'
                                                    ? 'border-indigo-600 text-indigo-600'
                                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                                            }`}
                                        >
                                            <span>⚖️ Appeals</span> ({appeals.filter(a => a.drive_id === selectedDrive?.id).length || appeals.length})
                                        </button>
                                        <button
                                            onClick={() => { setActiveTab('announcements'); fetchAnnouncements(selectedDrive?.club_id); }}
                                            className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                                                activeTab === 'announcements'
                                                    ? 'border-indigo-600 text-indigo-600'
                                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                                            }`}
                                        >
                                            <span>📢 Announcements</span>
                                        </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Tab: Applications */}
                                {activeTab === 'applications' && (
                                    <div className="p-6">
                                        <div className="grid gap-3 md:grid-cols-[1fr_auto] mb-5">
                                            <label className="relative block">
                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                                                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search candidate, drive, or notes..." className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
                                            </label>
                                            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="py-2 border border-gray-300 rounded-lg bg-white px-3 text-sm text-gray-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none">
                                                <option>All</option>
                                                <option>Applied</option>
                                                <option>Under Review</option>
                                                <option>Shortlisted</option>
                                                <option>Selected</option>
                                                <option>Rejected</option>
                                            </select>
                                        </div>

                                        {filteredApplications.length === 0 ? (
                                            <div className="text-center py-12">
                                                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
                                                    <Users size={32} />
                                                </div>
                                                <h3 className="text-lg font-medium text-gray-900">{applications.length === 0 ? 'No applications yet' : 'No matching applications'}</h3>
                                                <p className="text-gray-500">{applications.length === 0 ? 'When students apply, they will appear here.' : 'Try changing the search or status filter.'}</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-4">
                                                {filteredApplications.map(app => (
                                                    <article key={app.id} className="rounded-xl border border-gray-200 bg-white p-5 transition hover:border-indigo-200 hover:bg-gray-50/50 hover:shadow-sm">
                                                        <div className="flex flex-col gap-4 border-b border-gray-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
                                                            <div className="min-w-0 flex-1">
                                                                <h3 className="text-lg font-semibold text-gray-900 break-words">{app.student_name}</h3>
                                                                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
                                                                    <span>{app.department}</span>
                                                                    <span className="text-gray-300">•</span>
                                                                    <span>Year {app.year}</span>
                                                                    <span className="text-gray-300">•</span>
                                                                    {app.portfolio_url ? (
                                                                        <a href={app.portfolio_url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline truncate max-w-[200px]">Portfolio Link</a>
                                                                    ) : (
                                                                        <span className="text-gray-400">No portfolio</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <button onClick={() => openProfile(app)} disabled={profileLoading} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-60">
                                                                <UserRound size={15} /> View Profile
                                                            </button>
                                                        </div>
                                                        <div className="mt-4 flex items-center gap-2">
                                                            <span className={`px-3 py-1 rounded-full text-xs font-medium border shrink-0 ${
                                                                app.status === 'Applied' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                                app.status === 'Under Review' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                                                                app.status === 'Shortlisted' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                                                                app.status === 'Selected' ? 'bg-green-50 text-green-700 border-green-200' :
                                                                'bg-red-50 text-red-700 border-red-200'
                                                            }`}>
                                                                {app.status}
                                                            </span>
                                                        </div>
                                                        
                                                        <div className="mt-4 rounded-lg bg-gray-50 p-4 text-sm text-gray-700 break-words">
                                                            <span className="font-semibold text-gray-900 block mb-1">Motivation / Answers:</span>
                                                            {app.motivation || 'No motivation provided.'}
                                                        </div>

                                                        <label className="block mb-4">
                                                            <span className="flex items-center gap-2 font-semibold text-gray-900 mb-1 text-sm"><FileText size={15} /> Coordinator Notes</span>
                                                            <textarea value={app.notes || ''} onChange={e => setApplications(current => current.map(item => item.id === app.id ? { ...item, notes: e.target.value } : item))} rows="2" placeholder="Add interview notes, follow-up reminders, or decision context..." className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm" />
                                                            <button onClick={() => saveNotes(app.id)} disabled={savingNotes === app.id} className="mt-2 text-xs font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-50">{savingNotes === app.id ? 'Saving notes...' : 'Save Notes'}</button>
                                                        </label>
                                                        
                                                        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                                                            <button onClick={() => updateStatus(app.id, 'Under Review')} className="text-xs px-3 py-1.5 bg-yellow-100 text-yellow-800 rounded hover:bg-yellow-200 transition-colors">Mark Under Review</button>
                                                            <button onClick={() => updateStatus(app.id, 'Shortlisted')} className="text-xs px-3 py-1.5 bg-purple-100 text-purple-800 rounded hover:bg-purple-200 transition-colors">Shortlist</button>
                                                            <button onClick={() => updateStatus(app.id, 'Selected')} className="text-xs px-3 py-1.5 bg-green-100 text-green-800 rounded hover:bg-green-200 transition-colors">Accept</button>
                                                            <button onClick={() => updateStatus(app.id, 'Rejected')} className="text-xs px-3 py-1.5 bg-red-100 text-red-800 rounded hover:bg-red-200 transition-colors">Reject</button>
                                                        </div>
                                                    </article>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Tab: Pipeline / Kanban */}
                                {activeTab === 'pipeline' && (
                                    <div className="p-6">
                                        <KanbanBoard
                                            drive={selectedDrive}
                                            applications={applications}
                                            onRefresh={() => fetchApplications(selectedDrive.id)}
                                            onViewProfile={(appId) => {
                                                const app = applications.find(a => a.id === appId);
                                                if (app) viewProfile(app);
                                            }}
                                        />
                                    </div>
                                )}

                                {/* Tab: Q&A */}
                                {activeTab === 'qa' && (
                                    <div className="p-6">
                                        <div className="mb-4">
                                            <h3 className="text-lg font-bold text-gray-900">Student Q&A</h3>
                                            <p className="text-xs text-gray-500 mt-0.5">Answer candidate questions about requirements, timeline, or club structure. Answered questions become public.</p>
                                        </div>

                                        {qaError && (
                                            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
                                                {qaError}
                                            </div>
                                        )}

                                        {qaLoading ? (
                                            <div className="text-center py-8 text-gray-400 text-sm">Loading questions...</div>
                                        ) : qa.length === 0 ? (
                                            <div className="text-center py-12 bg-gray-50 rounded-xl border border-gray-100">
                                                <MessageSquare className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                                                <p className="font-semibold text-gray-700 text-sm">No questions asked yet</p>
                                                <p className="text-xs text-gray-400 mt-1">Questions submitted by students will appear here for you to answer.</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-4">
                                                {qa.map(item => (
                                                    <div key={item.id} className="p-4 rounded-xl border border-gray-200 bg-white shadow-sm">
                                                        <div className="flex items-start justify-between gap-2 mb-2">
                                                            <div className="min-w-0 flex-1">
                                                                <span className="text-xs font-semibold text-indigo-600 block">{item.asker_name || 'Applicant'} asked:</span>
                                                                <p className="text-sm font-bold text-gray-900 mt-0.5 break-words">{item.question}</p>
                                                            </div>
                                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 border ${
                                                                item.answer ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                                                            }`}>
                                                                {item.answer ? 'Answered' : 'Pending Answer'}
                                                            </span>
                                                        </div>

                                                        {item.answer ? (
                                                            <div className="mt-3 pl-3 border-l-2 border-indigo-500 bg-gray-50 p-2.5 rounded-r-lg break-words">
                                                                <p className="text-sm text-gray-800 break-words">{item.answer}</p>
                                                                {item.answerer_name && (
                                                                    <span className="block text-[11px] text-gray-400 mt-1">
                                                                        Answered by {item.answerer_name} · {item.answered_at ? new Date(item.answered_at).toLocaleDateString() : ''}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <div className="mt-3 pt-3 border-t border-gray-100">
                                                                <textarea
                                                                    rows="2"
                                                                    value={qaAnswer[item.id] || ''}
                                                                    onChange={e => setQaAnswer(prev => ({ ...prev, [item.id]: e.target.value }))}
                                                                    placeholder="Type your answer (once posted, this answer cannot be edited and becomes public)..."
                                                                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none"
                                                                />
                                                                <div className="flex justify-end mt-2">
                                                                    <button
                                                                        onClick={() => submitAnswer(selectedDrive.id, item.id)}
                                                                        disabled={qaSubmitting === item.id || !(qaAnswer[item.id] || '').trim()}
                                                                        className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-xs rounded-lg transition-colors"
                                                                    >
                                                                        {qaSubmitting === item.id ? 'Posting...' : 'Post Answer'}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Tab: Interview Slots & Bookings */}
                                {activeTab === 'interviews' && (
                                    <div className="p-6 space-y-6">
                                        {/* Publish Slot Form */}
                                        <form onSubmit={handleCreateSlot} className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-4">
                                            <h3 className="text-sm font-bold text-gray-900">Publish New Interview Slot</h3>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                                <div>
                                                    <label className="block font-semibold text-gray-700 mb-1">Start Time</label>
                                                    <input
                                                        type="datetime-local"
                                                        required
                                                        value={newSlot.start_time}
                                                        onChange={e => setNewSlot(prev => ({ ...prev, start_time: e.target.value }))}
                                                        className="w-full px-3 py-1.5 border border-gray-300 rounded-lg bg-white"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block font-semibold text-gray-700 mb-1">End Time</label>
                                                    <input
                                                        type="datetime-local"
                                                        required
                                                        value={newSlot.end_time}
                                                        onChange={e => setNewSlot(prev => ({ ...prev, end_time: e.target.value }))}
                                                        className="w-full px-3 py-1.5 border border-gray-300 rounded-lg bg-white"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block font-semibold text-gray-700 mb-1">Location / Link</label>
                                                    <input
                                                        type="text"
                                                        required
                                                        placeholder="MMCOE Room 204 or Meet URL"
                                                        value={newSlot.location}
                                                        onChange={e => setNewSlot(prev => ({ ...prev, location: e.target.value }))}
                                                        className="w-full px-3 py-1.5 border border-gray-300 rounded-lg bg-white"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block font-semibold text-gray-700 mb-1">Capacity</label>
                                                    <div className="flex gap-2">
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            max="10"
                                                            value={newSlot.capacity}
                                                            onChange={e => setNewSlot(prev => ({ ...prev, capacity: Number(e.target.value) }))}
                                                            className="w-20 px-3 py-1.5 border border-gray-300 rounded-lg bg-white"
                                                        />
                                                        <button
                                                            type="submit"
                                                            disabled={savingSlot}
                                                            className="flex-1 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-xs"
                                                        >
                                                            {savingSlot ? 'Publishing...' : 'Add Slot'}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </form>

                                        {/* Published Slots Grid */}
                                        <div className="space-y-3">
                                            <h4 className="text-sm font-bold text-gray-900">
                                                Active Interview Slots ({slotsData.slots?.length || 0})
                                            </h4>
                                            {loadingSlots ? (
                                                <div className="py-8 text-center text-xs text-gray-400">Loading slots...</div>
                                            ) : slotsData.slots?.length === 0 ? (
                                                <p className="text-xs text-gray-400 italic">No interview slots published yet.</p>
                                            ) : (
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    {slotsData.slots?.map(s => (
                                                        <div key={s.id} className="p-3 bg-white border border-gray-200 rounded-xl flex items-center justify-between text-xs shadow-xs">
                                                            <div>
                                                                <div className="font-bold text-gray-900">
                                                                    {new Date(s.start_time).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                                                                </div>
                                                                <div className="text-gray-500">
                                                                    {new Date(s.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – {new Date(s.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                </div>
                                                                <div className="text-[11px] text-gray-600 mt-0.5">
                                                                    {s.location} · {s.booked_count} of {s.capacity} booked
                                                                </div>
                                                            </div>
                                                            <button
                                                                onClick={() => handleCancelSlot(s.id)}
                                                                className="text-xs text-red-600 hover:text-red-800 font-semibold px-2 py-1"
                                                            >
                                                                Cancel
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* Booked Candidates & Kit */}
                                        <div className="space-y-3">
                                            <h4 className="text-sm font-bold text-gray-900">
                                                Candidate Bookings ({slotsData.bookings?.length || 0})
                                            </h4>
                                            {slotsData.bookings?.length === 0 ? (
                                                <p className="text-xs text-gray-400 italic">No candidates booked yet.</p>
                                            ) : (
                                                <div className="space-y-2">
                                                    {slotsData.bookings?.map(b => (
                                                        <div key={b.id} className="p-3 bg-white border border-gray-200 rounded-xl flex items-center justify-between gap-3 text-xs shadow-xs">
                                                            <div className="min-w-0 flex-1">
                                                                <span className="font-bold text-gray-900 break-words">{b.student_name}</span>
                                                                <span className="text-gray-400 ml-2 break-all">({b.student_email})</span>
                                                                <div className="text-gray-500 mt-0.5">
                                                                    Slot: {new Date(b.created_at).toLocaleDateString()} · Status: <strong className="text-emerald-700">{b.status}</strong>
                                                                </div>
                                                            </div>
                                                            <button
                                                                onClick={() => handleMarkNoShow(b.id)}
                                                                className="px-3 py-1 bg-gray-100 hover:bg-amber-100 text-amber-800 rounded text-xs font-semibold shrink-0"
                                                            >
                                                                Mark No Show
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Tab: Assessment Builder */}
                                {activeTab === 'tests' && (
                                    <div className="p-6 space-y-6">
                                        {loadingTest ? (
                                            <div className="py-12 text-center text-xs text-gray-400">Loading assessment definition...</div>
                                        ) : (
                                            <form onSubmit={handleSaveTest} className="space-y-5">
                                            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                                                <h3 className="text-sm font-bold text-gray-900">Assessment Settings</h3>
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                                                    <div className="md:col-span-2">
                                                        <label className="block font-semibold text-gray-700 mb-1">Assessment Title</label>
                                                        <input
                                                            type="text"
                                                            required
                                                            value={testForm.title}
                                                            onChange={e => setTestForm(prev => ({ ...prev, title: e.target.value }))}
                                                            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg bg-white"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block font-semibold text-gray-700 mb-1">Timer (Minutes)</label>
                                                        <input
                                                            type="number"
                                                            min="5"
                                                            max="180"
                                                            required
                                                            value={testForm.duration_minutes}
                                                            onChange={e => setTestForm(prev => ({ ...prev, duration_minutes: Number(e.target.value) }))}
                                                            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg bg-white"
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Questions List */}
                                            <div className="space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <h4 className="text-sm font-bold text-gray-900">
                                                        Assessment Questions ({testForm.questions?.length || 0})
                                                    </h4>
                                                    <div className="flex gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => setTestForm(prev => ({
                                                                ...prev,
                                                                questions: [
                                                                    ...prev.questions,
                                                                    {
                                                                        id: `q_${Date.now()}`,
                                                                        type: 'mcq',
                                                                        prompt: '',
                                                                        options: ['Option 1', 'Option 2', 'Option 3', 'Option 4'],
                                                                        correct_option: 'Option 1',
                                                                        points: 10
                                                                    }
                                                                ]
                                                            }))}
                                                            className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold"
                                                        >
                                                            + Add Timed MCQ
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setTestForm(prev => ({
                                                                ...prev,
                                                                questions: [
                                                                    ...prev.questions,
                                                                    {
                                                                        id: `q_${Date.now()}`,
                                                                        type: 'short_answer',
                                                                        prompt: '',
                                                                        points: 20
                                                                    }
                                                                ]
                                                            }))}
                                                            className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg text-xs font-bold"
                                                        >
                                                            + Add Short Answer
                                                        </button>
                                                    </div>
                                                </div>

                                                {testForm.questions?.map((q, qIdx) => (
                                                    <div key={q.id || qIdx} className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3 text-xs">
                                                        <div className="flex items-center justify-between">
                                                            <span className="font-bold text-gray-800">
                                                                Question {qIdx + 1} ({q.type.toUpperCase()})
                                                            </span>
                                                            <button
                                                                type="button"
                                                                onClick={() => setTestForm(prev => ({
                                                                    ...prev,
                                                                    questions: prev.questions.filter((_, i) => i !== qIdx)
                                                                }))}
                                                                className="text-red-600 hover:text-red-800 font-bold"
                                                            >
                                                                Remove
                                                            </button>
                                                        </div>

                                                        <input
                                                            type="text"
                                                            placeholder="Question prompt..."
                                                            value={q.prompt}
                                                            onChange={e => {
                                                                const val = e.target.value;
                                                                setTestForm(prev => {
                                                                    const updated = [...prev.questions];
                                                                    updated[qIdx].prompt = val;
                                                                    return { ...prev, questions: updated };
                                                                });
                                                            }}
                                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
                                                        />

                                                        {q.type === 'mcq' && (
                                                            <div className="space-y-1.5 pl-2">
                                                                <span className="font-semibold text-gray-600">Options & Correct Answer:</span>
                                                                <div className="grid grid-cols-2 gap-2">
                                                                    {q.options?.map((opt, oIdx) => (
                                                                        <div key={oIdx} className="flex items-center gap-2">
                                                                            <input
                                                                                type="radio"
                                                                                name={`correct_${q.id}`}
                                                                                checked={q.correct_option === opt}
                                                                                onChange={() => {
                                                                                    setTestForm(prev => {
                                                                                        const updated = [...prev.questions];
                                                                                        updated[qIdx].correct_option = opt;
                                                                                        return { ...prev, questions: updated };
                                                                                    });
                                                                                }}
                                                                                title="Mark as correct option"
                                                                            />
                                                                            <input
                                                                                type="text"
                                                                                value={opt}
                                                                                onChange={e => {
                                                                                    const val = e.target.value;
                                                                                    setTestForm(prev => {
                                                                                        const updated = [...prev.questions];
                                                                                        updated[qIdx].options[oIdx] = val;
                                                                                        return { ...prev, questions: updated };
                                                                                    });
                                                                                }}
                                                                                className="flex-1 px-2.5 py-1 text-xs border border-gray-200 rounded bg-white"
                                                                            />
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="flex justify-end pt-2">
                                                <button
                                                    type="submit"
                                                    disabled={savingTest}
                                                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-sm"
                                                >
                                                    {savingTest ? 'Saving Schema...' : 'Save Assessment Definition'}
                                                </button>
                                            </div>
                                        </form>
                                        )}
                                    </div>
                                )}

                                {/* Tab: Stage Broadcast */}
                                {activeTab === 'broadcast' && (
                                    <div className="p-6 space-y-6">
                                        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-4">
                                            <div>
                                                <h3 className="text-sm font-bold text-gray-900">Bulk Stage Communication</h3>
                                                <p className="text-xs text-gray-500">
                                                    Dispatch notifications and instructions to all candidates in a specific pipeline stage.
                                                </p>
                                            </div>

                                            {broadcastSuccess && (
                                                <div className="p-3 bg-emerald-100 border border-emerald-200 text-emerald-900 text-xs font-semibold rounded-lg">
                                                    {broadcastSuccess}
                                                </div>
                                            )}

                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                                                <div>
                                                    <label className="block font-semibold text-gray-700 mb-1">Target Stage</label>
                                                    <select
                                                        value={broadcastStage}
                                                        onChange={e => setBroadcastStage(e.target.value)}
                                                        className="w-full px-3 py-1.5 border border-gray-300 rounded-lg bg-white"
                                                    >
                                                        <option value="stage_screening">Screening</option>
                                                        <option value="stage_test">Skill Assessment / Test</option>
                                                        <option value="stage_interview">Interview</option>
                                                        <option value="stage_final">Final Selection</option>
                                                    </select>
                                                </div>

                                                <div className="md:col-span-2">
                                                    <label className="block font-semibold text-gray-700 mb-1">Subject</label>
                                                    <input
                                                        type="text"
                                                        value={broadcastSubject}
                                                        onChange={e => setBroadcastSubject(e.target.value)}
                                                        className="w-full px-3 py-1.5 border border-gray-300 rounded-lg bg-white"
                                                    />
                                                </div>
                                            </div>

                                            <div className="text-xs">
                                                <label className="block font-semibold text-gray-700 mb-1">
                                                    Message Body (Variables: <code>&#123;&#123;student_name&#125;&#125;</code>, <code>&#123;&#123;drive_title&#125;&#125;</code>, <code>&#123;&#123;club_name&#125;&#125;</code>)
                                                </label>
                                                <textarea
                                                    rows={4}
                                                    value={broadcastBody}
                                                    onChange={e => setBroadcastBody(e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
                                                />
                                            </div>

                                            <div className="flex gap-2">
                                                <button
                                                    onClick={handlePreviewBroadcast}
                                                    className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs font-bold rounded-lg"
                                                >
                                                    Preview Interpolation
                                                </button>
                                                <button
                                                    onClick={handleSendBroadcast}
                                                    disabled={sendingBroadcast}
                                                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm"
                                                >
                                                    {sendingBroadcast ? 'Sending...' : 'Dispatch Stage Broadcast'}
                                                </button>
                                            </div>

                                            {broadcastPreview && (
                                                <div className="p-4 bg-white border border-gray-200 rounded-xl space-y-2 text-xs">
                                                    <div className="flex items-center justify-between">
                                                        <span className="font-bold text-gray-700">Preview ({broadcastPreview.recipient_count} Recipients Targetted)</span>
                                                    </div>
                                                    <div className="text-gray-900 font-bold">{broadcastPreview.sample_preview?.subject}</div>
                                                    <p className="text-gray-700 whitespace-pre-wrap">{broadcastPreview.sample_preview?.body}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Tab: Appeals */}
                                {activeTab === 'appeals' && (
                                    <div className="p-6 space-y-6">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h3 className="text-base font-bold text-gray-900 flex items-center space-x-2">
                                                    <span>⚖️</span>
                                                    <span>Recruitment Appeals</span>
                                                </h3>
                                                <p className="text-xs text-gray-500 mt-0.5">
                                                    Review candidate appeals. To ensure fairness, reviews must be conducted by an independent panel coordinator.
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => fetchAppeals(selectedDrive?.club_id)}
                                                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg transition-colors"
                                            >
                                                Refresh
                                            </button>
                                        </div>

                                        {loadingAppeals ? (
                                            <div className="py-12 flex justify-center">
                                                <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-indigo-600"></div>
                                            </div>
                                        ) : appeals.length === 0 ? (
                                            <div className="p-12 text-center bg-gray-50 rounded-2xl border border-gray-200 text-gray-500 text-xs">
                                                No appeals have been submitted for this club.
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                {appeals.map(ap => (
                                                    <div
                                                        key={ap.id}
                                                        className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs space-y-3"
                                                    >
                                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                                            <div className="min-w-0 flex-1">
                                                                <h4 className="text-xs font-bold text-gray-900 break-words">{ap.student_name} <span className="text-gray-400 break-all font-normal">({ap.student_email})</span></h4>
                                                                <p className="text-[11px] text-gray-500 break-words">
                                                                    Drive: {ap.drive_title} • Filed {new Date(ap.created_at).toLocaleDateString()}
                                                                </p>
                                                            </div>
                                                            <div className="flex items-center space-x-2 shrink-0">
                                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                                    ap.status === 'Overturned' ? 'bg-green-100 text-green-800' :
                                                                    ap.status === 'Upheld' ? 'bg-red-100 text-red-800' :
                                                                    ap.status === 'Under Review' ? 'bg-blue-100 text-blue-800' :
                                                                    'bg-amber-100 text-amber-800'
                                                                }`}>
                                                                    {ap.status}
                                                                </span>
                                                                <button
                                                                    onClick={() => {
                                                                        setReviewingAppeal(ap);
                                                                        setAppealNotes(ap.reviewer_notes || '');
                                                                        const parsedStages = parseJsonSafe(ap.drive_stages, []);
                                                                        setAppealTargetStage(parsedStages[0]?.id || 'screening');
                                                                        setAppealActionError('');
                                                                    }}
                                                                    className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-lg border border-indigo-200"
                                                                >
                                                                    Review
                                                                </button>
                                                            </div>
                                                        </div>

                                                        <div className="p-3 bg-gray-50 rounded-lg text-xs text-gray-700 break-words">
                                                            <p className="font-semibold text-gray-900 mb-0.5">Candidate Reason:</p>
                                                            <p className="whitespace-pre-wrap break-words">{ap.reason}</p>
                                                            {ap.attachment_url && (
                                                                <a
                                                                    href={ap.attachment_url}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="mt-2 inline-flex items-center text-indigo-600 underline text-[11px] font-medium break-all"
                                                                >
                                                                    📎 View Attachment
                                                                </a>
                                                            )}
                                                        </div>

                                                        {ap.reviewer_notes && (
                                                            <div className="p-2.5 bg-blue-50/70 border border-blue-200 rounded-lg text-xs text-blue-900 break-words">
                                                                <span className="font-bold">Reviewer Note: </span>
                                                                <span>{ap.reviewer_notes}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Appeal Review Modal */}
                                        {reviewingAppeal && (
                                            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
                                                <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-gray-100">
                                                    <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                                                        <h3 className="text-sm font-bold text-gray-900">
                                                            Review Appeal: {reviewingAppeal.student_name}
                                                        </h3>
                                                        <button onClick={() => setReviewingAppeal(null)} className="text-gray-400 hover:text-gray-600">✕</button>
                                                    </div>

                                                    {appealActionError && (
                                                        <div className="mt-3 p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200">
                                                            {appealActionError}
                                                        </div>
                                                    )}

                                                    <div className="mt-4 space-y-4 text-xs">
                                                        <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                                                            <p className="font-bold text-gray-800">Appeal Submission:</p>
                                                            <p className="text-gray-600 mt-1 whitespace-pre-wrap">{reviewingAppeal.reason}</p>
                                                        </div>

                                                        <div>
                                                            <label className="block font-semibold text-gray-700 mb-1">
                                                                If Overturning, select pipeline stage to restore candidate to:
                                                            </label>
                                                            <select
                                                                value={appealTargetStage}
                                                                onChange={e => setAppealTargetStage(e.target.value)}
                                                                className="w-full p-2.5 border border-gray-300 rounded-xl bg-white"
                                                            >
                                                                {parseJsonSafe(reviewingAppeal.drive_stages, []).map(s => (
                                                                    <option key={s.id} value={s.id}>{s.name}</option>
                                                                ))}
                                                            </select>
                                                        </div>

                                                        <div>
                                                            <label className="block font-semibold text-gray-700 mb-1">
                                                                Reviewer Notes (shared with candidate):
                                                            </label>
                                                            <textarea
                                                                rows={3}
                                                                value={appealNotes}
                                                                onChange={e => setAppealNotes(e.target.value)}
                                                                placeholder="Explanation of appeal determination..."
                                                                className="w-full p-2.5 border border-gray-300 rounded-xl"
                                                            />
                                                        </div>

                                                        <div className="pt-2 flex justify-end gap-2">
                                                            <button
                                                                type="button"
                                                                disabled={appealActionLoading}
                                                                onClick={() => handleReviewAppeal('Upheld')}
                                                                className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl font-bold"
                                                            >
                                                                Uphold Decision
                                                            </button>
                                                            <button
                                                                type="button"
                                                                disabled={appealActionLoading}
                                                                onClick={() => handleReviewAppeal('Overturned')}
                                                                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold shadow-sm"
                                                            >
                                                                Overturn & Restore
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Tab: Announcements */}
                                {activeTab === 'announcements' && (
                                    <div className="p-6 space-y-6">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h3 className="text-base font-bold text-gray-900 flex items-center space-x-2">
                                                    <span>📢</span>
                                                    <span>Club Announcements</span>
                                                </h3>
                                                <p className="text-xs text-gray-500 mt-0.5">
                                                    Post broadcasts to applicants across all drives or existing club members.
                                                </p>
                                            </div>
                                        </div>

                                        {announcementMsg && (
                                            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold rounded-xl">
                                                {announcementMsg}
                                            </div>
                                        )}

                                        {/* Composer */}
                                        <form onSubmit={handleCreateAnnouncement} className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3 text-xs">
                                            <h4 className="font-bold text-gray-800">New Announcement Broadcast</h4>
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                                <div className="md:col-span-2">
                                                    <label className="block font-semibold text-gray-700 mb-1">Title</label>
                                                    <input
                                                        type="text"
                                                        required
                                                        value={announcementTitle}
                                                        onChange={e => setAnnouncementTitle(e.target.value)}
                                                        placeholder="e.g. Orientation Schedule or Workshop Notice"
                                                        className="w-full p-2.5 border border-gray-300 rounded-lg bg-white"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block font-semibold text-gray-700 mb-1">Target Audience</label>
                                                    <select
                                                        value={announcementAudience}
                                                        onChange={e => setAnnouncementAudience(e.target.value)}
                                                        className="w-full p-2.5 border border-gray-300 rounded-lg bg-white"
                                                    >
                                                        <option value="all">Everyone (Applicants + Members)</option>
                                                        <option value="applicants">Drive Applicants Only</option>
                                                        <option value="members">Club Members Only</option>
                                                    </select>
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block font-semibold text-gray-700 mb-1">Announcement Content</label>
                                                <textarea
                                                    rows={3}
                                                    required
                                                    value={announcementContent}
                                                    onChange={e => setAnnouncementContent(e.target.value)}
                                                    placeholder="Write the full announcement message..."
                                                    className="w-full p-2.5 border border-gray-300 rounded-lg bg-white"
                                                />
                                            </div>

                                            <div className="flex justify-end">
                                                <button
                                                    type="submit"
                                                    disabled={postingAnnouncement}
                                                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-sm"
                                                >
                                                    {postingAnnouncement ? 'Posting...' : 'Dispatch Announcement'}
                                                </button>
                                            </div>
                                        </form>

                                        {/* Past announcements */}
                                        <div className="space-y-3">
                                            <h4 className="text-xs font-bold text-gray-700">Past Club Announcements</h4>
                                            {loadingAnnouncements ? (
                                                <div className="py-8 flex justify-center">
                                                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
                                                </div>
                                            ) : announcements.length === 0 ? (
                                                <p className="text-xs text-gray-400 italic">No announcements posted yet.</p>
                                            ) : (
                                                announcements.map(an => (
                                                    <div key={an.id} className="p-3.5 bg-white border border-gray-200 rounded-xl space-y-1">
                                                        <div className="flex items-start justify-between gap-2">
                                                            <span className="font-bold text-xs text-gray-900 min-w-0 flex-1 break-words">{an.title}</span>
                                                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-700 uppercase shrink-0">
                                                                Audience: {an.audience}
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-gray-700 whitespace-pre-wrap break-words">{an.content}</p>
                                                        <p className="text-[10px] text-gray-400 pt-1">
                                                            Posted by {an.author_name} • {new Date(an.created_at).toLocaleDateString()}
                                                        </p>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )
                    )}
                    {!selectedDrive && (
                        <div className="bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-center h-64 text-gray-500">
                            Select a drive from the left to view applications & Q&A
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CoordinatorDrives;
