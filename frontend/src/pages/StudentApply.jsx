import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from '../api';
import { ArrowLeft, Send, CheckCircle, AlertCircle, Clock, RotateCcw, Trash2, MessageSquare } from 'lucide-react';
import { notifyDataChanged } from '../hooks/useDataSync';

const DRAFT_KEY = (driveId) => `apply_draft_${driveId}`;

const StudentApply = () => {
    const { driveId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();

    const [drive, setDrive] = useState(null);
    const [existingApp, setExistingApp] = useState(null);  // existing non-withdrawn application
    const [loadError, setLoadError] = useState('');
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [withdrawing, setWithdrawing] = useState(false);
    const [submitError, setSubmitError] = useState('');
    const [draftSaved, setDraftSaved] = useState(false);

    const [formData, setFormData] = useState({ motivation: '', ai_consent: false });
    const autosaveTimer = useRef(null);

    // Drive Q&A state
    const [qaList, setQaList] = useState([]);
    const [newQuestion, setNewQuestion] = useState('');
    const [askingQuestion, setAskingQuestion] = useState(false);
    const [qaSuccess, setQaSuccess] = useState('');

    // Load drive and any existing application
    useEffect(() => {
        let cancelled = false;
        Promise.all([
            axios.get(`/drives/${driveId}`).catch(() => null),
            axios.get('/applications').catch(() => ({ data: [] }))
        ]).then(([driveRes, appsRes]) => {
            if (cancelled) return;
            if (!driveRes) { setLoadError('Drive not found.'); setLoading(false); return; }
            setDrive(driveRes.data);

            const apps = Array.isArray(appsRes.data) ? appsRes.data : [];
            const existing = apps.find(a => String(a.drive_id) === String(driveId) && !a.is_withdrawn);
            setExistingApp(existing || null);

            // Restore draft from localStorage
            const draft = localStorage.getItem(DRAFT_KEY(driveId));
            if (draft && !existing) {
                try {
                    const parsed = JSON.parse(draft);
                    setFormData(prev => ({ ...prev, ...parsed, ai_consent: false }));
                } catch { /* ignore */ }
            }
            // Prefill motivation from profile if no draft and no existing app
            if (!draft && !existing && user) {
                axios.get(`/users/${user.id}`).then(r => {
                    if (cancelled) return;
                    const bio = r.data?.bio || '';
                    if (bio) setFormData(prev => ({ ...prev, motivation: prev.motivation || bio }));
                }).catch(() => {});
            }
            setLoading(false);
        });
        return () => { cancelled = true; };
    }, [driveId, user?.id]);

    const fetchDriveQA = useCallback(() => {
        axios.get(`/drives/${driveId}/qa`)
            .then(res => setQaList(res.data))
            .catch(() => {});
    }, [driveId]);

    useEffect(() => {
        fetchDriveQA();
    }, [fetchDriveQA]);

    const handleAskQuestion = async (e) => {
        e.preventDefault();
        if (!newQuestion.trim()) return;
        setAskingQuestion(true);
        setQaSuccess('');
        try {
            await axios.post(`/drives/${driveId}/qa`, { question: newQuestion.trim() });
            setNewQuestion('');
            setQaSuccess('Question submitted! It will appear publicly once answered by the coordinator.');
            fetchDriveQA();
        } catch (err) {
            setSubmitError(err.response?.data?.error || 'Unable to submit question');
        } finally {
            setAskingQuestion(false);
        }
    };

    // Debounced autosave to localStorage
    const saveDraft = useCallback((data) => {
        clearTimeout(autosaveTimer.current);
        autosaveTimer.current = setTimeout(() => {
            localStorage.setItem(DRAFT_KEY(driveId), JSON.stringify({ motivation: data.motivation }));
            setDraftSaved(true);
            setTimeout(() => setDraftSaved(false), 1500);
        }, 800);
    }, [driveId]);

    const handleChange = (field, value) => {
        const updated = { ...formData, [field]: value };
        setFormData(updated);
        if (field === 'motivation') saveDraft(updated);
    };

    // Readiness checks
    const deadlinePassed = drive && new Date(drive.deadline) < new Date();
    const isPublished = drive && ['open', 'published'].includes(drive.status);
    const motivationOk = formData.motivation.trim().length >= 20;
    const consentOk = formData.ai_consent;
    const readyToSubmit = motivationOk && consentOk && isPublished && !deadlinePassed;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitError('');
        setSubmitting(true);
        try {
            const res = await axios.post('/applications', {
                drive_id: parseInt(driveId),
                motivation: formData.motivation.trim(),
                ai_consent: formData.ai_consent
            });
            localStorage.removeItem(DRAFT_KEY(driveId));
            notifyDataChanged();
            if (res.data.resubmitted) {
                setExistingApp(prev => ({ ...prev, version: res.data.version }));
                setSubmitError('');
                alert(`Re-submitted! This is version ${res.data.version} of your application.`);
            } else {
                alert('Application submitted successfully!');
                navigate('/student/dashboard');
            }
        } catch (err) {
            const msg = err.response?.data?.error || 'Error submitting application';
            setSubmitError(msg);
        } finally {
            setSubmitting(false);
        }
    };

    const handleWithdraw = async () => {
        if (!existingApp) return;
        if (!window.confirm('Withdraw your application? This cannot be undone before the deadline.')) return;
        setWithdrawing(true);
        try {
            await axios.patch(`/applications/${existingApp.id}/withdraw`);
            notifyDataChanged();
            setExistingApp(null);
            alert('Application withdrawn.');
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to withdraw');
        } finally {
            setWithdrawing(false);
        }
    };

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
        </div>
    );

    if (loadError) return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="text-center">
                <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
                <p className="text-gray-600">{loadError}</p>
                <Link to="/student/apply" className="mt-4 inline-block text-indigo-600 hover:underline">← Back to Apply Hub</Link>
            </div>
        </div>
    );

    if (!drive) return null;

    const isAfterDeadline = new Date(drive.deadline) < new Date();

    return (
        <div className="bg-gray-50 min-h-screen py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto">
                <Link to="/student/apply" className="inline-flex items-center text-indigo-600 hover:text-indigo-800 mb-6 font-medium">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back to Apply Hub
                </Link>

                <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
                    {/* Drive header */}
                    <div className="bg-indigo-600 p-8 text-white">
                        <h1 className="text-3xl font-bold mb-1 break-words">{drive.title}</h1>
                        <p className="text-indigo-100 text-sm break-words">{drive.club_name}</p>
                        <p className="text-indigo-200 text-xs mt-1 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Deadline: {new Date(drive.deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                    </div>

                    <div className="p-8">
                        {/* Status banners */}
                        {isAfterDeadline && (
                            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
                                <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                                <p className="text-red-700 text-sm font-medium">This drive has closed. Applications are no longer accepted.</p>
                            </div>
                        )}
                        {!isPublished && !isAfterDeadline && (
                            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-xl flex items-center gap-3">
                                <AlertCircle className="w-5 h-5 text-yellow-500 shrink-0" />
                                <p className="text-yellow-700 text-sm font-medium">This drive is not yet open for applications.</p>
                            </div>
                        )}

                        {/* Existing application notice */}
                        {existingApp && (
                            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                                        <p className="text-green-700 text-sm font-medium break-words">
                                            Application submitted (version {existingApp.version || 1}).
                                            {!isAfterDeadline && ' You can update it before the deadline.'}
                                        </p>
                                    </div>
                                    {!isAfterDeadline && (
                                        <button onClick={handleWithdraw} disabled={withdrawing}
                                            className="flex items-center gap-1 text-xs text-red-600 hover:text-red-800 font-medium disabled:opacity-60 shrink-0 self-end sm:self-auto">
                                            <Trash2 className="w-3 h-3" />
                                            {withdrawing ? 'Withdrawing…' : 'Withdraw'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Readiness checklist */}
                        {!isAfterDeadline && isPublished && (
                            <div className="mb-6 border border-gray-200 rounded-xl p-4 bg-gray-50">
                                <p className="text-sm font-semibold text-gray-700 mb-3">Before you submit:</p>
                                <ul className="space-y-2">
                                    <li className={`flex items-center gap-2 text-sm ${motivationOk ? 'text-green-700' : 'text-gray-500'}`}>
                                        <CheckCircle className={`w-4 h-4 ${motivationOk ? 'text-green-500' : 'text-gray-300'}`} />
                                        Motivation statement (min 20 characters)
                                    </li>
                                    <li className={`flex items-center gap-2 text-sm ${consentOk ? 'text-green-700' : 'text-gray-500'}`}>
                                        <CheckCircle className={`w-4 h-4 ${consentOk ? 'text-green-500' : 'text-gray-300'}`} />
                                        AI processing consent acknowledged
                                    </li>
                                </ul>
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-6">
                            {/* Motivation */}
                            <div>
                                <label htmlFor="motivation" className="block text-sm font-medium text-gray-700 mb-2">
                                    Why do you want to join? <span className="text-red-500">*</span>
                                </label>
                                <textarea
                                    id="motivation"
                                    rows="6"
                                    required
                                    disabled={isAfterDeadline || !isPublished}
                                    placeholder="Tell us about your relevant skills, experience, and why you'd be a great fit…"
                                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
                                    value={formData.motivation}
                                    onChange={e => handleChange('motivation', e.target.value)}
                                />
                                <div className="flex justify-between mt-1">
                                    <span className={`text-xs ${formData.motivation.trim().length < 20 ? 'text-red-400' : 'text-green-600'}`}>
                                        {formData.motivation.trim().length} / 20 min chars
                                    </span>
                                    {draftSaved && <span className="text-xs text-gray-400 flex items-center gap-1"><RotateCcw className="w-3 h-3" /> Draft saved</span>}
                                </div>
                            </div>

                            {/* AI Consent */}
                            {!isAfterDeadline && isPublished && (
                                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                                    <label className="flex items-start gap-3 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={formData.ai_consent}
                                            onChange={e => handleChange('ai_consent', e.target.checked)}
                                            className="mt-0.5 w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                                        />
                                        <span className="text-sm text-blue-800">
                                            <strong>AI processing consent (required):</strong> I consent to my application being processed by AI tools to <em>assist</em>, not replace, human reviewers.
                                        </span>
                                    </label>
                                </div>
                            )}

                            {/* Error */}
                            {submitError && (
                                <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                                    <p className="text-red-700 text-sm">{submitError}</p>
                                </div>
                            )}

                            {/* Submit */}
                            {!isAfterDeadline && isPublished && (
                                <div>
                                    <button
                                        type="submit"
                                        disabled={submitting || !readyToSubmit}
                                        className="w-full flex items-center justify-center py-4 px-4 border border-transparent rounded-xl shadow-sm text-lg font-bold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                    >
                                        {submitting ? 'Submitting…' : existingApp ? (
                                            <><RotateCcw className="mr-2 w-5 h-5" /> Re-submit Application</>
                                        ) : (
                                            <><Send className="mr-2 w-5 h-5" /> Submit Application</>
                                        )}
                                    </button>
                                    {!readyToSubmit && !submitting && (
                                        <p className="text-xs text-center text-gray-400 mt-2">Complete all checklist items to enable submit.</p>
                                    )}
                                </div>
                            )}
                        </form>
                    </div>

                    {/* Drive Q&A Section */}
                    <div className="mt-8 bg-white rounded-3xl shadow-xl border border-gray-100 p-8 sm:p-10">
                        <div className="flex items-center gap-2 mb-2">
                            <MessageSquare className="w-5 h-5 text-indigo-600" />
                            <h3 className="text-xl font-bold text-gray-900">Questions & Answers</h3>
                        </div>
                        <p className="text-sm text-gray-500 mb-6">
                            Have questions about this drive? Ask the club coordinators below. Answered questions are visible to all students.
                        </p>

                        {qaSuccess && (
                            <div className="mb-5 p-3 bg-green-50 border border-green-200 text-green-800 text-sm rounded-xl">
                                {qaSuccess}
                            </div>
                        )}

                        {/* Ask form */}
                        <form onSubmit={handleAskQuestion} className="mb-6 flex flex-col sm:flex-row gap-2">
                            <input
                                type="text"
                                required
                                value={newQuestion}
                                onChange={e => setNewQuestion(e.target.value)}
                                placeholder="Ask about timeline, interview process, or requirements..."
                                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm outline-none"
                            />
                            <button
                                type="submit"
                                disabled={askingQuestion || !newQuestion.trim()}
                                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-sm rounded-xl transition-colors shrink-0"
                            >
                                {askingQuestion ? 'Submitting...' : 'Ask Question'}
                            </button>
                        </form>

                        {/* Questions list */}
                        {qaList.length === 0 ? (
                            <div className="text-center py-6 text-gray-400 text-sm bg-gray-50 rounded-xl">
                                No answered questions yet. Submit a question above to get clarification from the coordinators.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {qaList.map(item => (
                                    <div key={item.id} className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                                        <p className="font-semibold text-gray-900 text-sm mb-1.5 break-words">
                                            Q: {item.question}
                                        </p>
                                        <div className="text-sm text-gray-700 pl-3 border-l-2 border-indigo-500 bg-white/70 p-2.5 rounded-r-lg">
                                            <p className="font-medium text-gray-800 break-words">{item.answer}</p>
                                            {item.answerer_name && (
                                                <span className="block text-xs text-gray-400 mt-1">
                                                    Answered by {item.answerer_name} · {item.answered_at ? new Date(item.answered_at).toLocaleDateString() : ''}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StudentApply;
