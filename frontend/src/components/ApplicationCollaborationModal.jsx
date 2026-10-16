import React, { useState, useEffect, useRef } from 'react';
import axios from '../api';
import { useAuth } from '../context/AuthContext';
import { OUTCOME_BADGE_CLASSES } from '../utils/pipelineTransitions';

export default function ApplicationCollaborationModal({
    applicationId,
    drive,
    clubMembers = [],
    onClose,
    onApplicationUpdated
}) {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState('comments'); // 'comments' | 'scorecards' | 'timeline' | 'reviewers'
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [appData, setAppData] = useState(null);
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState('');
    const [submittingComment, setSubmittingComment] = useState(false);
    const [scorecardsData, setScorecardsData] = useState(null);
    const [myScores, setMyScores] = useState({});
    const [myRemarks, setMyRemarks] = useState('');
    const [submittingScorecard, setSubmittingScorecard] = useState(false);
    const [timeline, setTimeline] = useState([]);
    const [assignments, setAssignments] = useState([]);
    const [selectedReviewerId, setSelectedReviewerId] = useState('');
    const [viewers, setViewers] = useState([]);
    const [lastEdited, setLastEdited] = useState(null);
    const [conflictMessage, setConflictMessage] = useState(null);
    const [proposalNotes, setProposalNotes] = useState('');
    const [proposedOutcome, setProposedOutcome] = useState('Selected');
    const [actionLoading, setActionLoading] = useState(false);

    // AI Triage & Outreach state
    const [aiEvaluation, setAiEvaluation] = useState(null);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiError, setAiError] = useState(null);
    const [emailOutcome, setEmailOutcome] = useState('Selected');
    const [emailNotes, setEmailNotes] = useState('');
    const [draftEmail, setDraftEmail] = useState(null);
    const [draftingEmail, setDraftingEmail] = useState(false);
    const [copiedEmail, setCopiedEmail] = useState(false);
    const [copiedQuestionIdx, setCopiedQuestionIdx] = useState(null);

    const heartbeatRef = useRef(null);

    // Initial load
    useEffect(() => {
        let isMounted = true;

        const fetchData = async () => {
            try {
                setLoading(true);
                setError(null);
                const [appRes, commentsRes, scoresRes, timeRes, assignRes, lastRes, aiRes] = await Promise.all([
                    axios.get(`/applications/${applicationId}`),
                    axios.get(`/applications/${applicationId}/comments`).catch(() => ({ data: [] })),
                    axios.get(`/applications/${applicationId}/scorecards`).catch(() => ({ data: { scorecards: [] } })),
                    axios.get(`/collaboration/activity/application/${applicationId}`).catch(() => ({ data: { timeline: [] } })),
                    axios.get(`/applications/drive/${drive?.id || appRes?.data?.drive_id}/assignments`).catch(() => ({ data: [] })),
                    axios.get(`/collaboration/last-edited/application/${applicationId}`).catch(() => ({ data: { last_edited: null } })),
                    axios.get(`/applications/${applicationId}/ai-evaluation`).catch(() => ({ data: null }))
                ]);

                if (!isMounted) return;
                setAppData(appRes.data);
                setComments(commentsRes.data || []);
                setScorecardsData(scoresRes.data);
                setTimeline(timeRes.data.timeline || []);
                setAssignments((assignRes.data || []).filter(a => a.application_id === Number(applicationId)));
                setLastEdited(lastRes.data.last_edited);
                setAiEvaluation(aiRes.data);

                // If user already submitted scorecard, prefill their scores
                const userCard = scoresRes.data?.scorecards?.find(c => c.reviewer_id === user.id);
                if (userCard && userCard.scores_json) {
                    try {
                        setMyScores(JSON.parse(userCard.scores_json));
                        setMyRemarks(userCard.remarks || '');
                    } catch {}
                }
            } catch (err) {
                if (isMounted) setError(err.response?.data?.error || 'Failed to load application details');
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchData();

        // Heartbeat loop for "Currently Viewing"
        const sendHeartbeat = async () => {
            try {
                await axios.post('/collaboration/heartbeat', { entity_type: 'application', entity_id: applicationId });
                const viewersRes = await axios.get(`/collaboration/viewers/application/${applicationId}`);
                if (isMounted) setViewers(viewersRes.data.viewers || []);
            } catch {}
        };

        sendHeartbeat();
        heartbeatRef.current = setInterval(sendHeartbeat, 25000);

        return () => {
            isMounted = false;
            clearInterval(heartbeatRef.current);
        };
    }, [applicationId, drive?.id, user.id]);

    // Handle Comment Submit
    const handleAddComment = async (e) => {
        e.preventDefault();
        if (!newComment.trim()) return;
        try {
            setSubmittingComment(true);
            const res = await axios.post(`/applications/${applicationId}/comments`, { body: newComment });
            setComments(prev => [...prev, {
                ...res.data,
                author_name: user.name || user.email,
                author_role: user.role
            }]);
            setNewComment('');
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to post comment');
        } finally {
            setSubmittingComment(false);
        }
    };

    // Handle Scorecard Submit
    const handleSubmitScorecard = async (e) => {
        e.preventDefault();
        try {
            setSubmittingScorecard(true);
            await axios.post(`/applications/${applicationId}/scorecards`, {
                scores: myScores,
                remarks: myRemarks
            });
            alert('Scorecard submitted successfully!');
            // Refresh scorecards
            const updated = await axios.get(`/applications/${applicationId}/scorecards`);
            setScorecardsData(updated.data);
            if (onApplicationUpdated) onApplicationUpdated();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to submit scorecard');
        } finally {
            setSubmittingScorecard(false);
        }
    };

    // Reviewer Assign
    const handleAssignReviewer = async () => {
        if (!selectedReviewerId) return;
        try {
            await axios.post(`/applications/${applicationId}/assign`, { reviewer_id: Number(selectedReviewerId) });
            const assignRes = await axios.get(`/applications/drive/${drive.id}/assignments`);
            setAssignments((assignRes.data || []).filter(a => a.application_id === Number(applicationId)));
            setSelectedReviewerId('');
            if (onApplicationUpdated) onApplicationUpdated();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to assign reviewer');
        }
    };

    const handleUnassignReviewer = async (reviewerId) => {
        try {
            await axios.delete(`/applications/${applicationId}/assign/${reviewerId}`);
            setAssignments(prev => prev.filter(a => a.reviewer_id !== reviewerId));
            if (onApplicationUpdated) onApplicationUpdated();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to unassign reviewer');
        }
    };

    // Propose Decision (Maker)
    const handleProposeDecision = async () => {
        try {
            setActionLoading(true);
            await axios.post(`/applications/${applicationId}/propose`, {
                proposed_outcome: proposedOutcome,
                proposed_stage_id: appData.current_stage_id,
                notes: proposalNotes
            });
            alert('Decision proposed for lead approval!');
            setAppData(prev => ({ ...prev, approval_status: 'pending', proposed_outcome: proposedOutcome }));
            if (onApplicationUpdated) onApplicationUpdated();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to propose decision');
        } finally {
            setActionLoading(false);
        }
    };

    // Lead Approves Proposal (Checker)
    const handleApproveProposal = async () => {
        try {
            setActionLoading(true);
            const res = await axios.post(`/applications/${applicationId}/approve`);
            alert('Proposal approved successfully!');
            setAppData(prev => ({
                ...prev,
                outcome: res.data.outcome,
                current_stage_id: res.data.current_stage_id,
                approval_status: 'approved',
                version: res.data.version
            }));
            if (onApplicationUpdated) onApplicationUpdated();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to approve proposal');
        } finally {
            setActionLoading(false);
        }
    };

    // Lead Rejects Proposal
    const handleRejectProposal = async () => {
        try {
            setActionLoading(true);
            await axios.post(`/applications/${applicationId}/reject-proposal`);
            alert('Proposal rejected.');
            setAppData(prev => ({ ...prev, approval_status: 'rejected' }));
            if (onApplicationUpdated) onApplicationUpdated();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to reject proposal');
        } finally {
            setActionLoading(false);
        }
    };

    // Undo Stage Move
    const handleUndo = async () => {
        if (!confirm('Revert the last stage change?')) return;
        try {
            setActionLoading(true);
            const res = await axios.post(`/applications/${applicationId}/undo`);
            alert('Stage move reverted!');
            setAppData(prev => ({
                ...prev,
                current_stage_id: res.data.current_stage_id,
                outcome: res.data.outcome,
                version: res.data.version
            }));
            if (onApplicationUpdated) onApplicationUpdated();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to undo stage change');
        } finally {
            setActionLoading(false);
        }
    };

    // AI Evaluation Trigger
    const handleRunAiEvaluation = async () => {
        try {
            setAiLoading(true);
            setAiError(null);
            const res = await axios.post(`/applications/${applicationId}/ai-evaluate`);
            setAiEvaluation(res.data);
            if (onApplicationUpdated) onApplicationUpdated();
        } catch (err) {
            setAiError(err.response?.data?.error || 'AI evaluation failed');
        } finally {
            setAiLoading(false);
        }
    };

    // AI Email Draft Trigger
    const handleDraftEmail = async () => {
        try {
            setDraftingEmail(true);
            const res = await axios.post(`/applications/${applicationId}/draft-email`, {
                outcome: emailOutcome,
                feedback: emailNotes
            });
            setDraftEmail(res.data);
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to draft email');
        } finally {
            setDraftingEmail(false);
        }
    };

    // Copy Email to Clipboard
    const handleCopyEmail = () => {
        if (!draftEmail) return;
        const text = `Subject: ${draftEmail.subject}\n\n${draftEmail.body}`;
        navigator.clipboard.writeText(text);
        setCopiedEmail(true);
        setTimeout(() => setCopiedEmail(false), 2500);
    };

    // Add suggested question to comments
    const handleAddQuestionToComment = (question, idx) => {
        setNewComment(prev => (prev ? `${prev}\n[AI Question]: ${question}` : `[AI Question]: ${question}`));
        setCopiedQuestionIdx(idx);
        setTimeout(() => setCopiedQuestionIdx(null), 2000);
        setActiveTab('comments');
    };

    // Rubric criteria from drive
    let rubricCriteria = [];
    try {
        if (drive?.rubric) {
            rubricCriteria = typeof drive.rubric === 'string' ? JSON.parse(drive.rubric) : drive.rubric;
        }
    } catch {}

    const isLeadOrAdmin = user.role === 'admin' || clubMembers.some(m => m.user_id === user.id && m.role === 'lead');

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-gray-100">
                {/* Header */}
                <div className="px-6 py-4 bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-800 text-white flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                            <h2 className="text-xl font-bold tracking-tight break-words">
                                {appData?.student_name || `Application #${applicationId}`}
                            </h2>
                            {appData?.outcome && (
                                <span className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider shrink-0 ${OUTCOME_BADGE_CLASSES[appData.outcome] || 'bg-white/20 text-white'}`}>
                                    {appData.outcome}
                                </span>
                            )}
                            {appData?.approval_status === 'pending' && (
                                <span className="bg-amber-400 text-amber-950 text-xs px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1 animate-pulse shrink-0">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    Approval Pending
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-blue-100 mt-1 flex flex-wrap items-center gap-2">
                            <span className="truncate">{appData?.email}</span>
                            {appData?.department && <span>• {appData.department} Year {appData.year}</span>}
                            <span>• Version {appData?.version || 1}</span>
                        </p>
                    </div>

                    {/* Viewers & Close */}
                    <div className="flex items-center gap-3 shrink-0">
                        {viewers.length > 0 && (
                            <div className="flex items-center gap-1 bg-white/20 px-2.5 py-1 rounded-full text-xs" title={viewers.map(v => v.user_name).join(', ')}>
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                                <span className="font-medium text-emerald-200">
                                    {viewers.length} viewing
                                </span>
                            </div>
                        )}
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                            aria-label="Close modal"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                </div>

                {/* Subheader info bar */}
                <div className="px-6 py-2 bg-gray-50 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-gray-600">
                    <div className="min-w-0">
                        {lastEdited?.actor_name ? (
                            <span className="truncate block">Last edited by <strong>{lastEdited.actor_name}</strong> ({lastEdited.action})</span>
                        ) : (
                            <span>Application ID: #{applicationId}</span>
                        )}
                    </div>
                    {/* Navigation Tabs */}
                    <div className="flex gap-1.5 overflow-x-auto whitespace-nowrap -mx-2 px-2 sm:mx-0 sm:px-0">
                        {[
                            { id: 'comments', label: `Comments (${comments.length})` },
                            { id: 'scorecards', label: `Scorecards ${scorecardsData?.average_score ? `(★ ${scorecardsData.average_score})` : ''}` },
                            { id: 'reviewers', label: `Reviewers (${assignments.length})` },
                            { id: 'ai', label: `AI Triage ${aiEvaluation?.total_score !== undefined ? `(${aiEvaluation.total_score}pts)` : '✨'}` },
                            { id: 'timeline', label: 'Timeline' }
                        ].map(t => (
                            <button
                                key={t.id}
                                onClick={() => setActiveTab(t.id)}
                                className={`px-2.5 py-1 rounded-md font-medium text-xs transition-colors shrink-0 ${activeTab === t.id ? 'bg-blue-600 text-white shadow-sm' : 'hover:bg-gray-200 text-gray-700'}`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Conflict Banner */}
                {conflictMessage && (
                    <div className="px-6 py-3 bg-amber-50 border-b border-amber-200 text-amber-800 text-sm flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                            <span>{conflictMessage}</span>
                        </div>
                        <button
                            onClick={() => window.location.reload()}
                            className="text-xs bg-amber-600 hover:bg-amber-700 text-white font-bold px-3 py-1 rounded"
                        >
                            Reload
                        </button>
                    </div>
                )}

                {/* Modal Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {loading ? (
                        <div className="py-16 text-center text-gray-500">
                            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                            Loading application collaboration details...
                        </div>
                    ) : error ? (
                        <div className="p-4 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
                    ) : (
                        <>
                            {/* TAB 1: COMMENTS */}
                            {activeTab === 'comments' && (
                                <div className="space-y-4">
                                    <div className="text-xs text-gray-500 bg-blue-50 border border-blue-100 p-2.5 rounded-lg flex items-center gap-2">
                                        <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                        <span>Internal coordinator discussion only. Candidates cannot see these remarks. Type <strong>@name</strong> to mention a team member.</span>
                                    </div>

                                    <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                                        {comments.length === 0 ? (
                                            <p className="text-center py-8 text-gray-400 text-sm italic">No comments yet. Start the discussion!</p>
                                        ) : (
                                            comments.map(c => (
                                                <div key={c.id} className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                                                    <div className="flex items-center justify-between text-xs mb-1">
                                                        <span className="font-bold text-gray-800">{c.author_name}</span>
                                                        <span className="text-gray-400">
                                                            {new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            {c.is_edited ? ' (edited)' : ''}
                                                        </span>
                                                    </div>
                                                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{c.body}</p>
                                                </div>
                                            ))
                                        )}
                                    </div>

                                    <form onSubmit={handleAddComment} className="flex gap-2 pt-2">
                                        <input
                                            type="text"
                                            value={newComment}
                                            onChange={e => setNewComment(e.target.value)}
                                            placeholder="Write a comment... (use @name to notify a reviewer)"
                                            className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                        />
                                        <button
                                            type="submit"
                                            disabled={submittingComment || !newComment.trim()}
                                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
                                        >
                                            {submittingComment ? 'Sending...' : 'Send'}
                                        </button>
                                    </form>
                                </div>
                            )}

                            {/* TAB 2: SCORECARDS & RUBRIC */}
                            {activeTab === 'scorecards' && (
                                <div className="space-y-6">
                                    {/* Average Summary Bar */}
                                    <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl flex items-center justify-between">
                                        <div>
                                            <span className="text-xs font-bold uppercase tracking-wider text-indigo-700">Average Panel Score</span>
                                            <div className="text-2xl font-black text-indigo-900 mt-0.5">
                                                {scorecardsData?.average_score !== null ? `${scorecardsData.average_score} / 100` : 'No scores yet'}
                                            </div>
                                        </div>
                                        {scorecardsData?.disagreement_flag && (
                                            <div className="px-3 py-1.5 bg-amber-100 text-amber-800 rounded-lg text-xs font-bold flex items-center gap-1.5">
                                                <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                                High Disagreement (&gt;25pt gap)
                                            </div>
                                        )}
                                    </div>

                                    {/* Reviewer Scorecards List */}
                                    <div className="space-y-3">
                                        <h3 className="text-sm font-bold text-gray-800">Reviewer Submissions ({scorecardsData?.scorecards?.length || 0})</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {scorecardsData?.scorecards?.map(card => (
                                                <div key={card.id} className="p-3.5 bg-white border border-gray-200 rounded-xl shadow-sm space-y-2">
                                                    <div className="flex items-center justify-between">
                                                        <span className="font-bold text-sm text-gray-800">{card.reviewer_name}</span>
                                                        <span className="font-extrabold text-blue-700 text-sm">
                                                            {card.total_score !== null ? `${card.total_score} pts` : 'Hidden'}
                                                        </span>
                                                    </div>
                                                    {card.remarks && (
                                                        <p className="text-xs text-gray-600 italic">"{card.remarks}"</p>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Submit My Scorecard Form */}
                                    <form onSubmit={handleSubmitScorecard} className="bg-gray-50 border border-gray-200 p-4 rounded-xl space-y-4">
                                        <h4 className="font-bold text-sm text-gray-900">
                                            {scorecardsData?.user_submitted ? 'Update My Scorecard' : 'Submit My Evaluation'}
                                        </h4>

                                        {rubricCriteria.length > 0 ? (
                                            <div className="space-y-3">
                                                {rubricCriteria.map((c, idx) => {
                                                    const key = c.criterion || c.name || `criterion_${idx}`;
                                                    return (
                                                        <div key={key} className="flex items-center justify-between gap-4">
                                                            <div className="text-xs">
                                                                <span className="font-bold text-gray-800">{c.criterion || c.name}</span>
                                                                <span className="text-gray-400 ml-1">({c.weight}%)</span>
                                                                {c.description && <p className="text-gray-500">{c.description}</p>}
                                                            </div>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                max="100"
                                                                value={myScores[key] ?? ''}
                                                                onChange={e => setMyScores(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                                                                placeholder="0-100"
                                                                required
                                                                className="w-24 px-3 py-1.5 text-sm border border-gray-300 rounded-lg text-right font-mono"
                                                            />
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-between gap-4">
                                                <span className="text-xs font-semibold text-gray-700">Overall Score (0-100)</span>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="100"
                                                    value={myScores.overall ?? ''}
                                                    onChange={e => setMyScores({ overall: Number(e.target.value) })}
                                                    required
                                                    className="w-24 px-3 py-1.5 text-sm border border-gray-300 rounded-lg text-right font-mono"
                                                />
                                            </div>
                                        )}

                                        <div>
                                            <label className="block text-xs font-semibold text-gray-700 mb-1">Remarks & Observations</label>
                                            <textarea
                                                rows="2"
                                                value={myRemarks}
                                                onChange={e => setMyRemarks(e.target.value)}
                                                placeholder="Provide feedback on strengths and weaknesses..."
                                                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>

                                        <button
                                            type="submit"
                                            disabled={submittingScorecard}
                                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm"
                                        >
                                            {submittingScorecard ? 'Saving Scorecard...' : 'Submit Evaluation'}
                                        </button>
                                    </form>
                                </div>
                            )}

                            {/* TAB 3: REVIEWERS & APPROVALS */}
                            {activeTab === 'reviewers' && (
                                <div className="space-y-6">
                                    {/* Reviewer assignments */}
                                    <div className="bg-gray-50 border border-gray-200 p-4 rounded-xl space-y-3">
                                        <h3 className="text-sm font-bold text-gray-800">Assigned Reviewers</h3>
                                        <div className="flex flex-wrap gap-2">
                                            {assignments.length === 0 ? (
                                                <span className="text-xs text-gray-400 italic">No coordinators assigned to this candidate yet.</span>
                                            ) : (
                                                assignments.map(a => (
                                                    <span key={a.id} className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-gray-200 rounded-full text-xs font-medium text-gray-800 shadow-sm">
                                                        <span>{a.reviewer_name}</span>
                                                        <button
                                                            onClick={() => handleUnassignReviewer(a.reviewer_id)}
                                                            className="text-gray-400 hover:text-red-600 transition-colors"
                                                            title="Remove reviewer"
                                                        >
                                                            &times;
                                                        </button>
                                                    </span>
                                                ))
                                            )}
                                        </div>

                                        {/* Add Reviewer */}
                                        <div className="flex gap-2 pt-2">
                                            <select
                                                value={selectedReviewerId}
                                                onChange={e => setSelectedReviewerId(e.target.value)}
                                                className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg bg-white"
                                            >
                                                <option value="">Select coordinator to assign...</option>
                                                {clubMembers.map(m => (
                                                    <option key={m.user_id} value={m.user_id}>
                                                        {m.name || m.email} ({m.role})
                                                    </option>
                                                ))}
                                            </select>
                                            <button
                                                onClick={handleAssignReviewer}
                                                disabled={!selectedReviewerId}
                                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg disabled:opacity-50"
                                            >
                                                Assign
                                            </button>
                                        </div>
                                    </div>

                                    {/* Maker-Checker Workflow Panel */}
                                    <div className="border border-purple-200 bg-purple-50/50 p-4 rounded-xl space-y-3">
                                        <h3 className="text-sm font-bold text-purple-900 flex items-center gap-2">
                                            <span>Decision Approvals & Maker-Checker</span>
                                            {appData.approval_status === 'pending' && (
                                                <span className="bg-amber-400 text-amber-950 text-xs px-2 py-0.5 rounded-full font-bold">
                                                    Action Required
                                                </span>
                                            )}
                                        </h3>

                                        {appData.approval_status === 'pending' ? (
                                            <div className="bg-white p-3.5 rounded-lg border border-purple-100 space-y-2">
                                                <p className="text-xs text-gray-700">
                                                    Proposed outcome: <strong className="text-indigo-700 font-bold">{appData.proposed_outcome}</strong>
                                                </p>
                                                {isLeadOrAdmin ? (
                                                    <div className="flex gap-2 pt-1">
                                                        <button
                                                            onClick={handleApproveProposal}
                                                            disabled={actionLoading}
                                                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm"
                                                        >
                                                            {actionLoading ? 'Processing...' : 'Approve Decision'}
                                                        </button>
                                                        <button
                                                            onClick={handleRejectProposal}
                                                            disabled={actionLoading}
                                                            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg"
                                                        >
                                                            Reject Proposal
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <p className="text-xs text-amber-700 italic">
                                                        Pending club lead approval before the student is notified.
                                                    </p>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                <p className="text-xs text-gray-600">
                                                    Team members without final decision authority can propose a selection decision for club lead review.
                                                </p>
                                                <div className="space-y-2">
                                                    <textarea
                                                        value={proposalNotes}
                                                        onChange={e => setProposalNotes(e.target.value)}
                                                        placeholder="Add rationale / recommendation notes for the club lead..."
                                                        className="w-full text-xs p-2.5 border border-gray-300 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500"
                                                        rows={2}
                                                    />
                                                    <div className="flex gap-2">
                                                        <select
                                                            value={proposedOutcome}
                                                            onChange={e => setProposedOutcome(e.target.value)}
                                                            className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg bg-white"
                                                        >
                                                            <option value="Selected">Selected</option>
                                                            <option value="Advanced">Advanced (Shortlisted)</option>
                                                            <option value="Waitlisted">Waitlisted</option>
                                                            <option value="Rejected">Rejected</option>
                                                        </select>
                                                        <button
                                                            onClick={handleProposeDecision}
                                                            disabled={actionLoading}
                                                            className="px-4 py-1.5 bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold rounded-lg shadow-sm"
                                                        >
                                                            {actionLoading ? 'Submitting...' : 'Submit Proposal to Lead'}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Undo recent move */}
                                    <div className="border border-gray-200 p-4 rounded-xl flex items-center justify-between">
                                        <div>
                                            <h4 className="text-xs font-bold text-gray-800">Revert Last Stage Move</h4>
                                            <p className="text-xs text-gray-500">Restore candidate to previous pipeline stage</p>
                                        </div>
                                        <button
                                            onClick={handleUndo}
                                            disabled={actionLoading}
                                            className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs font-bold rounded-lg"
                                        >
                                            Undo Last Action
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* TAB 4: AI TRIAGE & ASSISTANT */}
                            {activeTab === 'ai' && (
                                <div className="space-y-6">
                                    {/* Mandatory Disclaimer */}
                                    <div className="p-3.5 bg-gradient-to-r from-purple-50 via-indigo-50 to-blue-50 border border-purple-200 rounded-xl flex items-start gap-3">
                                        <div className="p-2 bg-purple-600 text-white rounded-lg mt-0.5 shrink-0">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                        </div>
                                        <div>
                                            <h4 className="text-xs font-bold text-purple-950 uppercase tracking-wider">AI Recruitment Assistant</h4>
                                            <p className="text-xs text-purple-800 mt-0.5 font-medium leading-relaxed">
                                                AI-generated evaluation to assist, not replace, human reviewers. In accordance with MMCOE guidelines, all final decisions remain the sole responsibility of human coordinators.
                                            </p>
                                        </div>
                                    </div>

                                    {/* Consent Gate */}
                                    {!(appData?.ai_consent || appData?.ai_consent_at) ? (
                                        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 space-y-2">
                                            <div className="flex items-center gap-2 font-bold text-sm">
                                                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                                Candidate Consent Not Granted
                                            </div>
                                            <p className="text-xs leading-relaxed">
                                                The candidate did not opt into AI-assisted processing during application submission. In compliance with student privacy protection standards, automated triage and evaluation are disabled for this application. Please evaluate the applicant manually in the <strong>Scorecards</strong> tab.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="space-y-6">
                                            {/* AI Error Alert */}
                                            {aiError && (
                                                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center justify-between">
                                                    <span>{aiError}</span>
                                                    <button onClick={() => setAiError(null)} className="font-bold text-red-900 ml-2">&times;</button>
                                                </div>
                                            )}

                                            {/* Action Header */}
                                            <div className="flex items-center justify-between bg-gray-50 border border-gray-200 p-4 rounded-xl">
                                                <div>
                                                    <h3 className="text-sm font-bold text-gray-900">Rubric-Based Evaluation</h3>
                                                    <p className="text-xs text-gray-500">
                                                        {aiEvaluation
                                                            ? `Evaluated using ${aiEvaluation.model || 'AI Model'} (${aiEvaluation.tokens_used || 0} tokens used)`
                                                            : 'Analyze candidate submission and profile against this drive\'s rubric.'}
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={handleRunAiEvaluation}
                                                    disabled={aiLoading}
                                                    className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-2 disabled:opacity-50"
                                                >
                                                    {aiLoading ? (
                                                        <>
                                                            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                                            Evaluating Candidate...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                                            {aiEvaluation ? 'Re-run Evaluation' : 'Run AI Evaluation'}
                                                        </>
                                                    )}
                                                </button>
                                            </div>

                                            {/* Evaluation Results */}
                                            {aiEvaluation && (
                                                <div className="space-y-5">
                                                    {/* Total Score & Flags */}
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                        <div className="bg-purple-50 border border-purple-200 p-4 rounded-xl">
                                                            <span className="text-xs font-bold uppercase tracking-wider text-purple-700">AI Match Score</span>
                                                            <div className="text-3xl font-black text-purple-900 mt-1">
                                                                {aiEvaluation.total_score}
                                                                <span className="text-sm font-normal text-purple-600 ml-1">/ 100</span>
                                                            </div>
                                                        </div>

                                                        <div className="md:col-span-2 bg-gray-50 border border-gray-200 p-4 rounded-xl">
                                                            <span className="text-xs font-bold uppercase tracking-wider text-gray-600">Executive Summary</span>
                                                            <p className="text-xs text-gray-800 mt-1 leading-relaxed">
                                                                {aiEvaluation.summary || 'Candidate profile evaluated successfully against criteria.'}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {/* Deal-breaker or Security Flags */}
                                                    {aiEvaluation.flags && aiEvaluation.flags.length > 0 && (
                                                        <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl space-y-1">
                                                            <div className="flex items-center gap-1.5 text-xs font-bold text-red-800">
                                                                <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                                                <span>Flags & Deal Breaker Notices:</span>
                                                            </div>
                                                            <ul className="list-disc list-inside text-xs text-red-700 space-y-0.5 pl-1">
                                                                {aiEvaluation.flags.map((flag, idx) => (
                                                                    <li key={idx}>{flag}</li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    )}

                                                    {/* Criteria Breakdown */}
                                                    {aiEvaluation.scores && Object.keys(aiEvaluation.scores).length > 0 && (
                                                        <div className="bg-white border border-gray-200 p-4 rounded-xl space-y-3">
                                                            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700">Criteria Breakdown</h4>
                                                            <div className="space-y-2">
                                                                {Object.entries(aiEvaluation.scores).map(([criterion, score]) => (
                                                                    <div key={criterion} className="space-y-1">
                                                                        <div className="flex justify-between text-xs font-medium text-gray-700">
                                                                            <span className="capitalize">{criterion.replace(/_/g, ' ')}</span>
                                                                            <span className="font-bold text-gray-900">{score} / 100</span>
                                                                        </div>
                                                                        <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                                                                            <div
                                                                                className={`h-full rounded-full ${score >= 75 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                                                                                style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
                                                                            ></div>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Strengths & Growth Areas */}
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        {/* Strengths */}
                                                        <div className="bg-emerald-50/50 border border-emerald-200 p-4 rounded-xl space-y-2">
                                                            <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                                                                <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                                                                Identified Strengths
                                                            </h4>
                                                            <ul className="space-y-1 text-xs text-emerald-950">
                                                                {aiEvaluation.strengths && aiEvaluation.strengths.length > 0 ? (
                                                                    aiEvaluation.strengths.map((str, idx) => (
                                                                        <li key={idx} className="flex items-start gap-1.5">
                                                                            <span className="text-emerald-500 font-bold">•</span>
                                                                            <span>{str}</span>
                                                                        </li>
                                                                    ))
                                                                ) : (
                                                                    <li className="text-gray-400 italic">None highlighted</li>
                                                                )}
                                                            </ul>
                                                        </div>

                                                        {/* Growth Areas */}
                                                        <div className="bg-amber-50/50 border border-amber-200 p-4 rounded-xl space-y-2">
                                                            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
                                                                <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                                                Growth Areas / Gaps
                                                            </h4>
                                                            <ul className="space-y-1 text-xs text-amber-950">
                                                                {aiEvaluation.growth_areas && aiEvaluation.growth_areas.length > 0 ? (
                                                                    aiEvaluation.growth_areas.map((gap, idx) => (
                                                                        <li key={idx} className="flex items-start gap-1.5">
                                                                            <span className="text-amber-500 font-bold">•</span>
                                                                            <span>{gap}</span>
                                                                        </li>
                                                                    ))
                                                                ) : (
                                                                    <li className="text-gray-400 italic">None highlighted</li>
                                                                )}
                                                            </ul>
                                                        </div>
                                                    </div>

                                                    {/* Suggested Interview Questions */}
                                                    {aiEvaluation.suggested_questions && aiEvaluation.suggested_questions.length > 0 && (
                                                        <div className="bg-white border border-gray-200 p-4 rounded-xl space-y-3">
                                                            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
                                                                <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                                Suggested Interview Questions
                                                            </h4>
                                                            <div className="space-y-2">
                                                                {aiEvaluation.suggested_questions.map((q, idx) => (
                                                                    <div key={idx} className="p-3 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-between gap-3 text-xs">
                                                                        <p className="text-gray-800 font-medium">{q}</p>
                                                                        <div className="flex items-center gap-1.5 shrink-0">
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => {
                                                                                    navigator.clipboard.writeText(q);
                                                                                    setCopiedQuestionIdx(idx);
                                                                                    setTimeout(() => setCopiedQuestionIdx(null), 2000);
                                                                                }}
                                                                                className="px-2.5 py-1 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded border border-gray-200 text-xs font-semibold"
                                                                            >
                                                                                {copiedQuestionIdx === idx ? 'Copied!' : 'Copy'}
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleAddQuestionToComment(q, idx)}
                                                                                className="px-2.5 py-1 bg-purple-100 hover:bg-purple-200 text-purple-800 rounded text-xs font-semibold"
                                                                                title="Add to internal comments"
                                                                            >
                                                                                + Comment
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Outreach / Decision Email Assistant */}
                                            <div className="border border-indigo-200 bg-indigo-50/40 p-4 rounded-xl space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-900">
                                                            Draft Outreach / Decision Email
                                                        </h4>
                                                        <p className="text-xs text-gray-500">
                                                            Generate a professional, personalized notification email tailored to this candidate.
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                                    <div>
                                                        <label className="block text-xs font-semibold text-gray-700 mb-1">Outcome</label>
                                                        <select
                                                            value={emailOutcome}
                                                            onChange={e => setEmailOutcome(e.target.value)}
                                                            className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-lg bg-white"
                                                        >
                                                            <option value="Selected">Selected / Accepted</option>
                                                            <option value="Advanced">Advanced (Next Stage)</option>
                                                            <option value="Waitlisted">Waitlisted</option>
                                                            <option value="Rejected">Rejected</option>
                                                        </select>
                                                    </div>

                                                    <div className="md:col-span-2">
                                                        <label className="block text-xs font-semibold text-gray-700 mb-1">Notes / Next Steps / Feedback (Optional)</label>
                                                        <div className="flex gap-2">
                                                            <input
                                                                type="text"
                                                                value={emailNotes}
                                                                onChange={e => setEmailNotes(e.target.value)}
                                                                placeholder="e.g. Next round is Saturday 10 AM, or constructive tips"
                                                                className="flex-1 px-3 py-1.5 text-xs border border-gray-300 rounded-lg bg-white"
                                                            />
                                                            <button
                                                                onClick={handleDraftEmail}
                                                                disabled={draftingEmail}
                                                                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shrink-0 disabled:opacity-50"
                                                            >
                                                                {draftingEmail ? 'Drafting...' : 'Draft with AI'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Drafted Email Result */}
                                                {draftEmail && (
                                                    <div className="bg-white border border-indigo-200 rounded-lg p-3.5 space-y-2.5 mt-2">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-xs font-bold text-gray-700">Generated Email Draft</span>
                                                            <button
                                                                onClick={handleCopyEmail}
                                                                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded flex items-center gap-1 shadow-sm"
                                                            >
                                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                                                                {copiedEmail ? 'Copied to Clipboard!' : 'Copy Subject & Body'}
                                                            </button>
                                                        </div>
                                                        <div>
                                                            <label className="block text-[11px] font-bold text-gray-500 uppercase">Subject</label>
                                                            <input
                                                                type="text"
                                                                value={draftEmail.subject || ''}
                                                                onChange={e => setDraftEmail(prev => ({ ...prev, subject: e.target.value }))}
                                                                className="w-full px-2.5 py-1 text-xs font-semibold text-gray-900 border border-gray-200 rounded"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-[11px] font-bold text-gray-500 uppercase">Body</label>
                                                            <textarea
                                                                rows={6}
                                                                value={draftEmail.body || ''}
                                                                onChange={e => setDraftEmail(prev => ({ ...prev, body: e.target.value }))}
                                                                className="w-full p-2.5 text-xs text-gray-800 border border-gray-200 rounded leading-relaxed font-sans"
                                                            />
                                                        </div>
                                                        <p className="text-[11px] text-gray-400 italic">
                                                            Review and customize before sending via MMCOE official mail.
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* TAB 5: TIMELINE */}
                            {activeTab === 'timeline' && (
                                <div className="space-y-3">
                                    <h3 className="text-sm font-bold text-gray-800">Application Activity History</h3>
                                    {timeline.length === 0 ? (
                                        <p className="text-xs text-gray-400 italic">No activity recorded yet.</p>
                                    ) : (
                                        <div className="relative pl-6 border-l-2 border-blue-200 space-y-4">
                                            {timeline.map((entry, idx) => (
                                                <div key={idx} className="relative">
                                                    <div className="absolute -left-[31px] top-1 w-3 h-3 rounded-full bg-blue-600 border-2 border-white"></div>
                                                    <div className="text-xs">
                                                        <span className="font-bold text-gray-800">{entry.actor_name || entry.actor_email}</span>
                                                        <span className="text-gray-500 ml-1.5">
                                                            performed <strong>{entry.action}</strong>
                                                        </span>
                                                        <p className="text-gray-400 mt-0.5">
                                                            {new Date(entry.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                                        </p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm font-semibold rounded-lg"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
