import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from '../api';
import { API_ORIGIN } from '../api';
import {
    ArrowLeft, Camera, Edit2, Link as LinkIcon, Plus, X,
    Book, Award, Briefcase, Upload, FileText, Globe, ShieldCheck, ExternalLink, CheckCircle, ShieldAlert
} from 'lucide-react';
import { Link } from 'react-router-dom';
import NotificationPreferencesModal from '../components/NotificationPreferencesModal';
import DataPrivacyModal from '../components/DataPrivacyModal';

const GithubIcon = ({ className = 'w-4 h-4 mr-1' }) => (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
        <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
);

const LinkedinIcon = ({ className = 'w-4 h-4 mr-1' }) => (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
        <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
    </svg>
);

const parseJsonSafe = (str, fallback) => {
    if (!str) return fallback;
    if (typeof str === 'object') return str;
    try { return JSON.parse(str); } catch { return fallback; }
};

const StudentProfile = () => {
    const { user, setUser } = useAuth();
    const [isEditing, setIsEditing] = useState(false);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [resumeUploading, setResumeUploading] = useState(false);
    const [resumeError, setResumeError] = useState('');
    const [completeness, setCompleteness] = useState(null);
    const [resumePath, setResumePath] = useState(user?.resume_path || null);
    const [certificates, setCertificates] = useState([]);
    const [showNotifModal, setShowNotifModal] = useState(false);
    const [showPrivacyModal, setShowPrivacyModal] = useState(false);
    const resumeInputRef = useRef(null);

    const [formData, setFormData] = useState({
        name: '', department: '', year: '', bio: '',
        skills: [], interests: [], projects: [], achievements: [],
        github_url: '', linkedin_url: '', portfolio_url: ''
    });

    const [newSkill, setNewSkill] = useState('');
    const [newInterest, setNewInterest] = useState('');
    const [newAchievement, setNewAchievement] = useState('');
    const [newProject, setNewProject] = useState({ name: '', description: '', technologies: '', link: '' });

    // Fetch full profile (includes server-computed completeness)
    useEffect(() => {
        if (!user?.id) return;
        axios.get(`/users/${user.id}`)
            .then(res => {
                setCompleteness(res.data.completeness ?? null);
                setResumePath(res.data.resume_path || null);
            })
            .catch(() => {});
        axios.get('/lifecycle/certificates/my')
            .then(res => setCertificates(res.data || []))
            .catch(() => {});
    }, [user?.id]);

    // Sync form when user changes or edit mode resets
    useEffect(() => {
        if (user) {
            setFormData({
                name: user.name || '',
                department: user.department || '',
                year: user.year || '',
                bio: user.bio || '',
                skills: parseJsonSafe(user.skills, []),
                interests: parseJsonSafe(user.interests, []),
                projects: parseJsonSafe(user.projects, []),
                achievements: parseJsonSafe(user.achievements, []),
                github_url: user.github_url || '',
                linkedin_url: user.linkedin_url || '',
                portfolio_url: user.portfolio_url || ''
            });
        }
    }, [user, isEditing]);


    const handleSave = async () => {
        if (!formData.name.trim() || !formData.department.trim() || !formData.year || formData.year < 1 || formData.year > 4) {
            alert('Enter your name, department, and a valid year of study.');
            return;
        }
        setLoading(true);
        try {
            await axios.put(`/users/${user.id}`, {
                ...formData,
                name: formData.name.trim(),
                department: formData.department.trim(),
                skills: JSON.stringify(formData.skills),
                interests: JSON.stringify(formData.interests),
                projects: JSON.stringify(formData.projects),
                achievements: JSON.stringify(formData.achievements)
            });
            const updated = {
                ...user, ...formData,
                name: formData.name.trim(),
                department: formData.department.trim(),
                skills: JSON.stringify(formData.skills),
                interests: JSON.stringify(formData.interests),
                projects: JSON.stringify(formData.projects),
                achievements: JSON.stringify(formData.achievements)
            };
            setUser(updated);
            // Refresh completeness from server
            axios.get(`/users/${user.id}`)
                .then(res => setCompleteness(res.data.completeness ?? null))
                .catch(() => {});
            setIsEditing(false);
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to save profile');
        }
        setLoading(false);
    };

    const handleAvatarUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/') || file.size > 2 * 1024 * 1024) {
            alert('Choose an image smaller than 2 MB.');
            e.target.value = '';
            return;
        }
        const form = new FormData();
        form.append('avatar', file);
        setUploading(true);
        try {
            const res = await axios.post(`/users/${user.id}/avatar`, form, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setUser({ ...user, profile_picture_url: res.data.url });
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to upload picture');
        }
        setUploading(false);
        e.target.value = '';
    };

    const handleResumeUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setResumeError('');
        // Client-side pre-checks (server is authoritative)
        if (file.size > 5 * 1024 * 1024) {
            setResumeError('Resume must be under 5 MB.');
            e.target.value = '';
            return;
        }
        if (!file.name.toLowerCase().endsWith('.pdf')) {
            setResumeError('Only PDF files are accepted.');
            e.target.value = '';
            return;
        }
        const form = new FormData();
        form.append('resume', file);
        setResumeUploading(true);
        try {
            const res = await axios.post(`/users/${user.id}/resume`, form, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setResumePath(res.data.url);
            setUser({ ...user, resume_path: res.data.url });
            // Refresh completeness
            axios.get(`/users/${user.id}`)
                .then(r => setCompleteness(r.data.completeness ?? null))
                .catch(() => {});
        } catch (err) {
            setResumeError(err.response?.data?.error || 'Failed to upload resume');
        }
        setResumeUploading(false);
        e.target.value = '';
    };

    const addArrayItem = (field, value, setter) => {
        if (!value.trim()) return;
        setFormData(prev => ({ ...prev, [field]: [...prev[field], value.trim()] }));
        setter('');
    };

    const removeArrayItem = (field, index) => {
        setFormData(prev => ({ ...prev, [field]: prev[field].filter((_, i) => i !== index) }));
    };

    const addProject = () => {
        if (!newProject.name.trim()) return;
        setFormData(prev => ({ ...prev, projects: [...prev.projects, newProject] }));
        setNewProject({ name: '', description: '', technologies: '', link: '' });
    };

    const completenessColor = (c) => {
        if (c >= 80) return 'bg-green-500';
        if (c >= 50) return 'bg-yellow-400';
        return 'bg-red-400';
    };

    const ordinal = (n) => n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;

    return (
        <div className="bg-gray-50 min-h-screen py-8 px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto">
                <Link to="/student/dashboard" className="inline-flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-800 mb-6">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
                </Link>

                {/* Profile Header */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mb-6">
                    <div className="h-32 bg-gradient-to-r from-indigo-500 to-purple-600" />
                    <div className="px-8 pb-8">
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
                            <div className="relative -mt-16 mb-2 sm:mb-4">
                                {user.profile_picture_url ? (
                                    <img src={`${API_ORIGIN}${user.profile_picture_url}`} alt={user.name}
                                        className="w-32 h-32 rounded-full border-4 border-white object-cover bg-white" />
                                ) : (
                                    <div className="w-32 h-32 rounded-full border-4 border-white bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-4xl">
                                        {user.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                                    </div>
                                )}
                                {isEditing && (
                                    <label className="absolute bottom-0 right-0 p-2 bg-indigo-600 text-white rounded-full cursor-pointer hover:bg-indigo-700 shadow-md" aria-label="Upload avatar">
                                        <Camera className="w-5 h-5" />
                                        <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} disabled={uploading} />
                                    </label>
                                )}
                            </div>

                            <div className="mt-1 sm:mt-4 flex flex-wrap items-center gap-2">
                                {!isEditing ? (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => setShowNotifModal(true)}
                                            className="flex items-center px-3 py-2 border border-gray-300 rounded-md shadow-xs text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                                            title="Notification Delivery Preferences"
                                        >
                                            <span className="mr-1.5">🔔</span>
                                            <span className="hidden sm:inline">Alerts</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setShowPrivacyModal(true)}
                                            className="flex items-center px-3 py-2 border border-gray-300 rounded-md shadow-xs text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                                            title="Data Privacy & Personal Data Portability"
                                        >
                                            <ShieldAlert className="w-4 h-4 mr-1.5 text-indigo-600" />
                                            <span className="hidden sm:inline">Privacy & Data</span>
                                        </button>
                                        <button onClick={() => setIsEditing(true)} className="flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
                                            <Edit2 className="w-4 h-4 mr-2" /> Edit Profile
                                        </button>
                                    </>
                                ) : (
                                    <div className="flex space-x-2">
                                        <button onClick={() => setIsEditing(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
                                        <button onClick={handleSave} disabled={loading} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700 shadow-sm disabled:opacity-60">
                                            {loading ? 'Saving…' : 'Save Profile'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {!isEditing ? (
                            <div>
                                <h1 className="text-3xl font-bold text-gray-900 break-words">{user.name}</h1>
                                <p className="text-lg text-gray-600 mt-1">
                                    {user.department || 'Department not set'} • {user.year ? `${ordinal(user.year)} Year` : 'Year not set'}
                                </p>
                                <p className="text-sm text-gray-500 mt-1">MMCOE, Pune</p>

                                {/* Links row */}
                                {(user.github_url || user.linkedin_url || user.portfolio_url) && (
                                    <div className="flex flex-wrap gap-4 mt-3">
                                        {user.github_url && (
                                            <a href={user.github_url} target="_blank" rel="noopener noreferrer"
                                                className="flex items-center text-sm text-gray-600 hover:text-indigo-600">
                                                <GithubIcon className="w-4 h-4 mr-1 shrink-0" /> GitHub
                                            </a>
                                        )}
                                        {user.linkedin_url && (
                                            <a href={user.linkedin_url} target="_blank" rel="noopener noreferrer"
                                                className="flex items-center text-sm text-gray-600 hover:text-indigo-600">
                                                <LinkedinIcon className="w-4 h-4 mr-1 shrink-0" /> LinkedIn
                                            </a>
                                        )}
                                        {user.portfolio_url && (
                                            <a href={user.portfolio_url} target="_blank" rel="noopener noreferrer"
                                                className="flex items-center text-sm text-gray-600 hover:text-indigo-600">
                                                <Globe className="w-4 h-4 mr-1 shrink-0" /> Portfolio
                                            </a>
                                        )}
                                    </div>
                                )}

                                <div className="mt-4 text-gray-700 max-w-2xl">
                                    {user.bio ? <p className="break-words">{user.bio}</p> : <p className="text-gray-400 italic">No bio added yet.</p>}
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                <div>
                                    <label htmlFor="prof-name" className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                                    <input id="prof-name" type="text" value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm transition-colors" />
                                </div>
                                <div>
                                    <label htmlFor="prof-dept" className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                                    <input id="prof-dept" type="text" value={formData.department}
                                        onChange={e => setFormData({ ...formData, department: e.target.value })}
                                        placeholder="e.g. Computer Engineering" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm transition-colors" />
                                </div>
                                <div>
                                    <label htmlFor="prof-year" className="block text-sm font-medium text-gray-700 mb-1">Year (1–4)</label>
                                    <input id="prof-year" type="number" min="1" max="4" value={formData.year}
                                        onChange={e => setFormData({ ...formData, year: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm transition-colors" />
                                </div>
                                <div className="md:col-span-2">
                                    <label htmlFor="prof-bio" className="block text-sm font-medium text-gray-700 mb-1">Bio</label>
                                    <textarea id="prof-bio" value={formData.bio}
                                        onChange={e => setFormData({ ...formData, bio: e.target.value })}
                                        rows="3" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm transition-colors" />
                                </div>
                                <div>
                                    <label htmlFor="prof-github" className="block text-sm font-medium text-gray-700 mb-1">GitHub URL</label>
                                    <input id="prof-github" type="url" value={formData.github_url}
                                        onChange={e => setFormData({ ...formData, github_url: e.target.value })}
                                        placeholder="https://github.com/username" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm transition-colors" />
                                </div>
                                <div>
                                    <label htmlFor="prof-linkedin" className="block text-sm font-medium text-gray-700 mb-1">LinkedIn URL</label>
                                    <input id="prof-linkedin" type="url" value={formData.linkedin_url}
                                        onChange={e => setFormData({ ...formData, linkedin_url: e.target.value })}
                                        placeholder="https://linkedin.com/in/username" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm transition-colors" />
                                </div>
                                <div className="md:col-span-2">
                                    <label htmlFor="prof-portfolio" className="block text-sm font-medium text-gray-700 mb-1">Portfolio URL</label>
                                    <input id="prof-portfolio" type="url" value={formData.portfolio_url}
                                        onChange={e => setFormData({ ...formData, portfolio_url: e.target.value })}
                                        placeholder="https://yourportfolio.com" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm transition-colors" />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Main Content */}
                    <div className="md:col-span-2 space-y-6">

                        {/* Projects */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                                <Briefcase className="w-5 h-5 mr-2 text-indigo-600" /> Projects
                            </h2>
                            {!isEditing ? (
                                parseJsonSafe(user.projects, []).length === 0 ? (
                                    <div className="text-center py-6">
                                        <Book className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                                        <p className="text-gray-500 text-sm">Add projects to showcase your practical experience.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {parseJsonSafe(user.projects, []).map((proj, idx) => (
                                            <div key={idx} className="border border-gray-100 rounded-lg p-4 hover:border-indigo-100 transition-colors">
                                                <div className="flex justify-between">
                                                    <h3 className="font-bold text-gray-900">{proj.name}</h3>
                                                    {proj.link && <a href={proj.link} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-800"><LinkIcon className="w-4 h-4" /></a>}
                                                </div>
                                                <p className="text-sm text-indigo-600 font-medium mb-2">{proj.technologies}</p>
                                                <p className="text-sm text-gray-600">{proj.description}</p>
                                            </div>
                                        ))}
                                    </div>
                                )
                            ) : (
                                <div className="space-y-4">
                                    {formData.projects.map((proj, idx) => (
                                        <div key={idx} className="border border-gray-200 rounded-lg p-4 relative">
                                            <button onClick={() => removeArrayItem('projects', idx)} aria-label="Remove project"
                                                className="absolute top-2 right-2 text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button>
                                            <h4 className="font-bold">{proj.name}</h4>
                                            <p className="text-sm text-gray-500">{proj.technologies}</p>
                                        </div>
                                    ))}
                                    <div className="border border-dashed border-gray-300 rounded-lg p-4 bg-gray-50">
                                        <input type="text" placeholder="Project Name" value={newProject.name}
                                            onChange={e => setNewProject({ ...newProject, name: e.target.value })}
                                            className="w-full px-3 py-2 mb-2 border rounded-md text-sm" />
                                        <input type="text" placeholder="Technologies (e.g. React, Node.js)" value={newProject.technologies}
                                            onChange={e => setNewProject({ ...newProject, technologies: e.target.value })}
                                            className="w-full px-3 py-2 mb-2 border rounded-md text-sm" />
                                        <textarea placeholder="Description" rows="2" value={newProject.description}
                                            onChange={e => setNewProject({ ...newProject, description: e.target.value })}
                                            className="w-full px-3 py-2 mb-2 border rounded-md text-sm" />
                                        <input type="url" placeholder="Project Link (optional)" value={newProject.link}
                                            onChange={e => setNewProject({ ...newProject, link: e.target.value })}
                                            className="w-full px-3 py-2 mb-2 border rounded-md text-sm" />
                                        <button onClick={addProject} className="flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-800">
                                            <Plus className="w-4 h-4 mr-1" /> Add Project
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Achievements */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                                <Award className="w-5 h-5 mr-2 text-indigo-600" /> Achievements & Activities
                            </h2>
                            {!isEditing ? (
                                parseJsonSafe(user.achievements, []).length === 0 ? (
                                    <p className="text-gray-500 text-sm italic">Add competitions, certifications or college achievements.</p>
                                ) : (
                                    <ul className="list-disc list-inside space-y-2 text-gray-700">
                                        {parseJsonSafe(user.achievements, []).map((ach, idx) => <li key={idx}>{ach}</li>)}
                                    </ul>
                                )
                            ) : (
                                <div>
                                    <ul className="space-y-2 mb-3">
                                        {formData.achievements.map((ach, idx) => (
                                            <li key={idx} className="flex justify-between items-center bg-gray-50 px-3 py-2 rounded-md">
                                                <span className="text-sm">{ach}</span>
                                                <button onClick={() => removeArrayItem('achievements', idx)} aria-label="Remove achievement"
                                                    className="text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button>
                                            </li>
                                        ))}
                                    </ul>
                                    <div className="flex">
                                        <input type="text" value={newAchievement}
                                            onChange={e => setNewAchievement(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && addArrayItem('achievements', newAchievement, setNewAchievement)}
                                            placeholder="Add achievement…" className="flex-1 px-3 py-2 border rounded-l-md text-sm" />
                                        <button onClick={() => addArrayItem('achievements', newAchievement, setNewAchievement)}
                                            aria-label="Add achievement"
                                            className="bg-indigo-50 px-3 border border-l-0 border-gray-300 rounded-r-md text-indigo-600">
                                            <Plus className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Resume */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                                <FileText className="w-5 h-5 mr-2 text-indigo-600" /> Resume
                            </h2>
                            {resumePath ? (
                                <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg mb-3">
                                    <span className="text-sm text-green-800 font-medium">Resume uploaded ✓</span>
                                    <a href={`${API_ORIGIN}${resumePath}`} target="_blank" rel="noopener noreferrer"
                                        className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">View PDF</a>
                                </div>
                            ) : (
                                <p className="text-sm text-gray-500 italic mb-3">No resume uploaded yet.</p>
                            )}
                            {resumeError && <p className="text-sm text-red-600 mb-2">{resumeError}</p>}
                            <label className="flex items-center gap-2 cursor-pointer w-fit">
                                <input
                                    ref={resumeInputRef}
                                    type="file"
                                    accept=".pdf,application/pdf"
                                    className="hidden"
                                    onChange={handleResumeUpload}
                                    disabled={resumeUploading}
                                />
                                <button
                                    type="button"
                                    onClick={() => resumeInputRef.current?.click()}
                                    disabled={resumeUploading}
                                    className="flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-60"
                                >
                                    <Upload className="w-4 h-4 mr-2" />
                                    {resumeUploading ? 'Uploading…' : resumePath ? 'Replace Resume' : 'Upload Resume (PDF, max 5 MB)'}
                                </button>
                            </label>
                        </div>

                        {/* Verified Certificates & Credentials */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-xl font-bold text-gray-900 flex items-center">
                                    <ShieldCheck className="w-5 h-5 mr-2 text-indigo-600" /> Verified Club Credentials
                                </h2>
                                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                                    {certificates.length} {certificates.length === 1 ? 'Credential' : 'Credentials'}
                                </span>
                            </div>

                            {certificates.length === 0 ? (
                                <div className="text-center py-6 border border-dashed border-gray-200 rounded-xl">
                                    <ShieldCheck className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                                    <p className="text-sm text-gray-500">No verified club certificates issued yet.</p>
                                    <p className="text-xs text-gray-400 mt-1">Accept club offers and attend club events to earn verifiable credentials.</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {certificates.map((cert) => (
                                        <div key={cert.id} className="p-4 border border-indigo-100 rounded-xl bg-gradient-to-r from-indigo-50/40 via-white to-purple-50/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:border-indigo-300 transition-colors">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="font-bold text-gray-900 break-words">{cert.title}</span>
                                                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 uppercase tracking-wide shrink-0">
                                                        {cert.certificate_type}
                                                    </span>
                                                </div>
                                                <p className="text-sm text-gray-600 mt-1 truncate">{cert.club_name}</p>
                                                {cert.description && (
                                                    <p className="text-xs text-gray-500 mt-0.5 break-words">{cert.description}</p>
                                                )}
                                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-gray-400">
                                                    <span>Issued: {new Date(cert.issue_date).toLocaleDateString()}</span>
                                                    <span>•</span>
                                                    <span className="font-mono text-gray-500">Seal: {cert.unique_credential_hash.slice(0, 10)}…</span>
                                                </div>
                                            </div>
                                            <div className="flex sm:flex-col sm:items-end justify-between items-center gap-2">
                                                <Link
                                                    to={`/verify/${cert.unique_credential_hash}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center px-3 py-1.5 bg-white border border-indigo-200 hover:border-indigo-400 text-indigo-700 text-xs font-semibold rounded-lg shadow-xs hover:bg-indigo-50 transition-colors"
                                                >
                                                    <ExternalLink className="w-3.5 h-3.5 mr-1" /> Verify Seal
                                                </Link>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Sidebar */}
                    <div className="space-y-6">

                        {/* Profile Strength — server-driven */}
                        {!isEditing && (
                            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                                <h3 className="font-bold text-gray-900 mb-2">Profile Strength</h3>
                                {completeness === null ? (
                                    <p className="text-sm text-gray-400">Loading…</p>
                                ) : (
                                    <>
                                        <div className="flex justify-between text-sm mb-2">
                                            <span className="text-gray-500">Completeness</span>
                                            <span className="font-bold text-indigo-600">{completeness}%</span>
                                        </div>
                                        <div className="w-full bg-gray-100 rounded-full h-2">
                                            <div className={`${completenessColor(completeness)} h-2 rounded-full transition-all`}
                                                style={{ width: `${completeness}%` }} />
                                        </div>
                                        {completeness < 80 && (
                                            <p className="text-xs text-gray-500 mt-2">
                                                Add bio, links, skills, projects, achievements and a resume to reach 80 %+.
                                            </p>
                                        )}
                                    </>
                                )}
                            </div>
                        )}

                        {/* Skills */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                            <h3 className="font-bold text-gray-900 mb-4">Skills</h3>
                            {!isEditing ? (
                                <div className="flex flex-wrap gap-2">
                                    {parseJsonSafe(user.skills, []).length === 0
                                        ? <p className="text-gray-500 text-sm italic">No skills added.</p>
                                        : parseJsonSafe(user.skills, []).map((skill, idx) => (
                                            <span key={idx} className="bg-gray-100 text-gray-800 px-3 py-1 rounded-full text-sm font-medium">{skill}</span>
                                        ))}
                                </div>
                            ) : (
                                <div>
                                    <div className="flex flex-wrap gap-2 mb-3">
                                        {formData.skills.map((skill, idx) => (
                                            <span key={idx} className="bg-gray-100 text-gray-800 px-3 py-1 rounded-full text-sm font-medium flex items-center">
                                                {skill}
                                                <button onClick={() => removeArrayItem('skills', idx)} aria-label={`Remove ${skill}`}
                                                    className="ml-1 text-gray-500 hover:text-red-500"><X className="w-3 h-3" /></button>
                                            </span>
                                        ))}
                                    </div>
                                    <div className="flex">
                                        <input type="text" value={newSkill}
                                            onChange={e => setNewSkill(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && addArrayItem('skills', newSkill, setNewSkill)}
                                            placeholder="Add skill…" className="flex-1 px-3 py-2 border rounded-l-md text-sm" />
                                        <button onClick={() => addArrayItem('skills', newSkill, setNewSkill)}
                                            aria-label="Add skill"
                                            className="bg-indigo-50 px-3 border border-l-0 border-gray-300 rounded-r-md text-indigo-600">
                                            <Plus className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Interests */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                            <h3 className="font-bold text-gray-900 mb-4">Interests</h3>
                            {!isEditing ? (
                                <div className="flex flex-wrap gap-2">
                                    {parseJsonSafe(user.interests, []).length === 0
                                        ? <p className="text-gray-500 text-sm italic">No interests added.</p>
                                        : parseJsonSafe(user.interests, []).map((interest, idx) => (
                                            <span key={idx} className="bg-indigo-50 text-indigo-700 border border-indigo-100 px-3 py-1 rounded-full text-sm font-medium">{interest}</span>
                                        ))}
                                </div>
                            ) : (
                                <div>
                                    <div className="flex flex-wrap gap-2 mb-3">
                                        {formData.interests.map((interest, idx) => (
                                            <span key={idx} className="bg-indigo-50 text-indigo-700 border border-indigo-100 px-3 py-1 rounded-full text-sm font-medium flex items-center">
                                                {interest}
                                                <button onClick={() => removeArrayItem('interests', idx)} aria-label={`Remove ${interest}`}
                                                    className="ml-1 text-indigo-400 hover:text-indigo-800"><X className="w-3 h-3" /></button>
                                            </span>
                                        ))}
                                    </div>
                                    <div className="flex">
                                        <input type="text" value={newInterest}
                                            onChange={e => setNewInterest(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && addArrayItem('interests', newInterest, setNewInterest)}
                                            placeholder="Add interest…" className="flex-1 px-3 py-2 border rounded-l-md text-sm" />
                                        <button onClick={() => addArrayItem('interests', newInterest, setNewInterest)}
                                            aria-label="Add interest"
                                            className="bg-indigo-50 px-3 border border-l-0 border-gray-300 rounded-r-md text-indigo-600">
                                            <Plus className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                    </div>
                </div>
            </div>

            <NotificationPreferencesModal
                isOpen={showNotifModal}
                onClose={() => setShowNotifModal(false)}
            />

            <DataPrivacyModal
                isOpen={showPrivacyModal}
                onClose={() => setShowPrivacyModal(false)}
                user={user}
            />
        </div>
    );
};

export default StudentProfile;
