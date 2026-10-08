import React, { useCallback, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { ArrowLeft, Award, Briefcase, Calendar, CheckCircle, Clock, Code2, Edit3, ExternalLink, FileText, GraduationCap, Mail, Plus, Search, Trash2, UserRound, Users, X } from 'lucide-react';
import { notifyDataChanged, useDataSync } from '../hooks/useDataSync';

const emptyDrive = { title: '', description: '', eligibility: '', open_date: '', deadline: '', club_id: '' };

const CoordinatorDrives = () => {
    const { user } = useAuth();
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

    const fetchDrives = useCallback(() => {
        axios.get('http://localhost:5000/api/coordinator/drives')
            .then(res => setDrives(res.data))
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
    }, []);

    useDataSync(fetchDrives);

    const fetchApplications = (driveId) => {
        axios.get(`http://localhost:5000/api/applications/drive/${driveId}`)
            .then(res => setApplications(res.data))
            .catch(err => setError(err.response?.data?.error || 'Unable to load applications'));
    };

    const openCreate = async () => {
        setEditingDrive(null);
        setForm({ ...emptyDrive, open_date: new Date().toISOString().split('T')[0] });
        setError('');
        try {
            const response = await axios.get('http://localhost:5000/api/coordinator/clubs');
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
            eligibility: drive.eligibility,
            open_date: drive.open_date,
            deadline: drive.deadline,
            club_id: drive.club_id
        });
        setClubs([{ id: drive.club_id, name: selectedDrive?.club_name || 'Selected club' }]);
        setShowForm(true);
        setError('');
    };

    const handleDriveSubmit = async (event) => {
        event.preventDefault();
        setSaving(true);
        setError('');
        try {
            const payload = { ...form, club_id: form.club_id };
            if (editingDrive) {
                await axios.put(`http://localhost:5000/api/drives/${editingDrive.id}`, payload);
            } else {
                await axios.post('http://localhost:5000/api/drives', payload);
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
        if (!window.confirm(`Mark “${drive.title}” as ${status}?`)) return;
        try {
            await axios.put(`http://localhost:5000/api/drives/${drive.id}`, { ...drive, status });
            notifyDataChanged();
            await fetchDrives();
        } catch (err) {
            setError(err.response?.data?.error || 'Unable to update drive');
        }
    };

    const deleteDrive = async (drive) => {
        if (!window.confirm(`Delete “${drive.title}”? This cannot be undone.`)) return;
        try {
            await axios.delete(`http://localhost:5000/api/drives/${drive.id}`);
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
            await axios.put(`http://localhost:5000/api/applications/${appId}`, { status });
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
            await axios.put(`http://localhost:5000/api/applications/${appId}/notes`, { notes: application.notes });
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
            const response = await axios.get(`http://localhost:5000/api/applications/${application.id}/profile`);
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

    const parseJsonSafe = (value, fallback = []) => {
        if (!value) return fallback;
        if (Array.isArray(value)) return value;
        try { return JSON.parse(value); } catch { return fallback; }
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
                    <p className="text-gray-600 mt-2">Create recruitment drives and review applications.</p>
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
                    </div>
                    <div className="flex justify-end gap-3 mt-5">
                        <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
                        <button type="submit" disabled={saving} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-60">{saving ? 'Saving...' : editingDrive ? 'Save Changes' : 'Publish Drive'}</button>
                    </div>
                </form>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Drives List */}
                <div className="lg:col-span-1 space-y-4">
                    <h2 className="text-xl font-bold text-gray-900 mb-4">Your Drives</h2>
                    {drives.length === 0 ? (
                        <p className="text-gray-500 bg-gray-50 p-4 rounded-lg text-center">No active drives. Create one to get started.</p>
                    ) : (
                        drives.map(drive => (
                            <div 
                                key={drive.id}
                                onClick={() => {
                                    setSelectedDrive(drive);
                                    setShowProfile(false);
                                    setProfile(null);
                                    fetchApplications(drive.id);
                                }}
                                className={`p-4 rounded-xl cursor-pointer transition-all border ${selectedDrive?.id === drive.id ? 'bg-indigo-50 border-indigo-300 ring-1 ring-indigo-500' : 'bg-white border-gray-200 hover:border-indigo-300 shadow-sm'}`}
                            >
                                <div className="flex justify-between items-start mb-2 gap-2">
                                    <h3 className={`font-semibold ${selectedDrive?.id === drive.id ? 'text-indigo-900' : 'text-gray-900'}`}>{drive.title}</h3>
                                    <span className={`text-xs px-2 py-1 rounded-full ${drive.status === 'open' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                                        {drive.status}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between text-sm text-gray-500 gap-3">
                                    <div className="flex items-center space-x-1">
                                        <Calendar size={14} />
                                        <span>{drive.deadline}</span>
                                    </div>
                                    <div className="flex gap-1">
                                        <button onClick={e => { e.stopPropagation(); openEdit(drive); }} className="p-1.5 rounded-md text-gray-500 hover:bg-indigo-50 hover:text-indigo-600" aria-label={`Edit ${drive.title}`}><Edit3 size={15} /></button>
                                        <button onClick={e => { e.stopPropagation(); deleteDrive(drive); }} className="p-1.5 rounded-md text-gray-500 hover:bg-red-50 hover:text-red-600" aria-label={`Delete ${drive.title}`}><Trash2 size={15} /></button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Applications View */}
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
                                            <img src={`http://localhost:5000${profile.profile_picture_url}`} alt={profile.name} className="h-28 w-28 rounded-2xl border-4 border-white/20 object-cover shadow-xl" />
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
                                <div className="bg-gray-50 border-b border-gray-200 p-6">
                                    <h2 className="text-xl font-bold text-gray-900">Applications for {selectedDrive.title}</h2>
                                    <p className="text-sm text-gray-500 mt-1">Review candidates and update their status</p>
                                {selectedDrive.status === 'open' && (
                                    <button onClick={() => updateDriveStatus(selectedDrive, 'closed')} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                                        <Clock size={14} /> Close Drive
                                    </button>
                                )}
                            </div>

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
                                            <div key={app.id} className="border border-gray-200 rounded-lg p-5 hover:bg-gray-50 transition-colors">
                                                <div className="flex justify-between items-start mb-4 gap-4">
                                                    <div>
                                                        <h3 className="text-lg font-semibold text-gray-900">{app.student_name}</h3>
                                                        <div className="flex items-center text-sm text-gray-500 space-x-3 mt-1">
                                                            <span>{app.department}</span>
                                                            <span>•</span>
                                                            <span>Year {app.year}</span>
                                                            <span>•</span>
                                                            app.portfolio_url ? <a href={app.portfolio_url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">Portfolio Link</a> : <span className="text-gray-400">No portfolio</span>
                                                        </div>
                                                    </div>
                                                    <button onClick={() => openProfile(app)} disabled={profileLoading} className="flex shrink-0 items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-60">
                                                        <UserRound size={15} /> View Profile
                                                    </button>
                                                </div>
                                                <span className={`px-3 py-1 rounded-full text-xs font-medium border ${
                                                        app.status === 'Applied' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                        app.status === 'Under Review' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                                                        app.status === 'Shortlisted' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                                                        app.status === 'Selected' ? 'bg-green-50 text-green-700 border-green-200' :
                                                        'bg-red-50 text-red-700 border-red-200'
                                                    }`}>
                                                        {app.status}
                                                    </span>
                                                
                                                <div className="bg-gray-50 rounded p-4 mb-4 text-sm text-gray-700">
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
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                    {!selectedDrive && (
                        <div className="bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-center h-64 text-gray-500">
                            Select a drive from the left to view applications
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
};

export default CoordinatorDrives;

