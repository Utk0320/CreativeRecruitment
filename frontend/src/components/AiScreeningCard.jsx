import React, { useState } from 'react';
import { Sparkles, CheckCircle2, AlertTriangle, Clock, ChevronDown, ChevronUp, RefreshCw, ShieldAlert, Award } from 'lucide-react';
import axios from '../api';


/**
 * AiScreeningCard — Displays Google Gemini AI application screening metrics,
 * category score breakdown, explanation, strengths, missing skills,
 * and coordinator override actions.
 */
export default function AiScreeningCard({
    application,
    isCoordinator = false,
    onApplicationUpdated,
    compact = false
}) {
    const [expanded, setExpanded] = useState(!compact);
    const [rescreening, setRescreening] = useState(false);
    const [showOverrideModal, setShowOverrideModal] = useState(false);
    const [overrideStatus, setOverrideStatus] = useState('Under Review');
    const [overrideReason, setOverrideReason] = useState('');
    const [overriding, setOverriding] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    if (!application) return null;

    const hasEvaluation = application.ai_score !== null && application.ai_score !== undefined;
    const isNeedsReview = application.screening_status === 'needs_review' || Boolean(application.ai_needs_review);


    // Normalize strengths and missing skills
    let strengths = application.ai_strengths || [];
    if (typeof strengths === 'string') {
        try { strengths = JSON.parse(strengths); } catch { strengths = []; }
    }
    let missingSkills = application.ai_missing_skills || [];
    if (typeof missingSkills === 'string') {
        try { missingSkills = JSON.parse(missingSkills); } catch { missingSkills = []; }
    }

    const score = Number(application.ai_score) || 0;
    const skillMatch = Number(application.ai_skill_match) || 0;
    const portfolioRelevance = Number(application.ai_portfolio_relevance) || 0;
    const experience = Number(application.ai_experience) || 0;
    const availability = Number(application.ai_availability) || 0;

    const getScoreBadgeClass = (val) => {
        if (isNeedsReview) return 'bg-amber-50 text-amber-800 border-amber-300';
        if (val >= 70) return 'bg-emerald-50 text-emerald-800 border-emerald-300';
        if (val >= 30) return 'bg-indigo-50 text-indigo-800 border-indigo-300';
        return 'bg-rose-50 text-rose-800 border-rose-300';
    };

    const handleRescreen = async () => {
        try {
            setRescreening(true);
            setErrorMsg('');
            await axios.post(`/applications/${application.id}/rescreen`);
            if (onApplicationUpdated) onApplicationUpdated();
        } catch (err) {
            setErrorMsg(err.response?.data?.error || 'Failed to re-run AI evaluation');
        } finally {
            setRescreening(false);
        }
    };

    const handleOverrideSubmit = async (e) => {
        e.preventDefault();
        try {
            setOverriding(true);
            setErrorMsg('');
            await axios.post(`/applications/${application.id}/override-screening`, {
                status: overrideStatus,
                reason: overrideReason
            });
            setShowOverrideModal(false);
            setOverrideReason('');
            if (onApplicationUpdated) onApplicationUpdated();
        } catch (err) {
            setErrorMsg(err.response?.data?.error || 'Failed to override screening decision');
        } finally {
            setOverriding(false);
        }
    };

    return (
        <div className="mt-3 rounded-xl border border-indigo-100 bg-linear-to-br from-indigo-50/40 via-white to-purple-50/20 p-4 transition-all shadow-2xs">
            {/* Header row */}
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-2xs">
                        <Sparkles className="h-4 w-4" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-gray-900 tracking-wide uppercase flex items-center gap-1">
                                Gemini AI Screening
                            </span>
                            {/* Score or Status Badge */}
                            {hasEvaluation ? (
                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${getScoreBadgeClass(score)}`}>
                                    <Award className="w-3 h-3" />
                                    {score}% Match
                                </span>
                            ) : isNeedsReview ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border bg-amber-50 text-amber-800 border-amber-300">
                                    <AlertTriangle className="w-3 h-3" /> Needs Review
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border bg-blue-50 text-blue-700 border-blue-200">
                                    <Clock className="w-3 h-3 animate-spin" /> Screening in Progress
                                </span>
                            )}

                            {application.manual_override === 1 && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                                    Overridden by Coordinator
                                </span>
                            )}
                        </div>
                        {application.ai_evaluated_at && (
                            <p className="text-[10px] text-gray-400 mt-0.5">
                                Evaluated on {new Date(application.ai_evaluated_at).toLocaleDateString()}
                            </p>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {isCoordinator && (
                        <>
                            <button
                                type="button"
                                onClick={handleRescreen}
                                disabled={rescreening}
                                title="Re-screen with Gemini"
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 disabled:opacity-50 transition"
                            >
                                <RefreshCw className={`w-3 h-3 ${rescreening ? 'animate-spin text-indigo-600' : ''}`} />
                                <span className="hidden sm:inline">{rescreening ? 'Screening...' : 'Re-screen'}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowOverrideModal(true)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition"
                            >
                                Override
                            </button>
                        </>
                    )}
                    <button
                        type="button"
                        onClick={() => setExpanded(!expanded)}
                        className="text-gray-400 hover:text-gray-600 p-1"
                        aria-label="Toggle details"
                    >
                        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                </div>
            </div>

            {errorMsg && (
                <div className="mt-2 p-2 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>{errorMsg}</span>
                </div>
            )}

            {/* Expanded Content */}
            {expanded && (
                <div className="mt-3 pt-3 border-t border-indigo-50/80 space-y-3 text-xs">
                    {/* Short Explanation */}
                    {application.ai_explanation && (
                        <div className="p-3 bg-white/90 rounded-lg border border-gray-100 text-gray-700">
                            <span className="font-semibold text-gray-900 block mb-0.5">Evaluation Summary:</span>
                            <p className="leading-relaxed">{application.ai_explanation}</p>
                            {isNeedsReview && application.ai_review_reason && (
                                <p className="mt-1 text-amber-700 font-medium">
                                    ⚠️ Review Note: {application.ai_review_reason}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Category Breakdown (Visible to coordinator, and summary visible to student) */}
                    {(hasEvaluation || isCoordinator) && (
                        <div className="bg-white/80 p-3 rounded-lg border border-gray-100">
                            <span className="font-semibold text-gray-900 block mb-2 text-[11px] uppercase tracking-wider">
                                Evaluation Categories:
                            </span>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                <div className="p-2 rounded-lg bg-gray-50 border border-gray-100 text-center">
                                    <span className="text-[10px] text-gray-500 font-medium block">Skill Match (40%)</span>
                                    <span className="text-sm font-bold text-gray-900">{skillMatch}%</span>
                                    <div className="w-full bg-gray-200 h-1 rounded-full mt-1 overflow-hidden">
                                        <div className="bg-indigo-600 h-1 rounded-full" style={{ width: `${skillMatch}%` }} />
                                    </div>
                                </div>
                                <div className="p-2 rounded-lg bg-gray-50 border border-gray-100 text-center">
                                    <span className="text-[10px] text-gray-500 font-medium block">Portfolio (25%)</span>
                                    <span className="text-sm font-bold text-gray-900">{portfolioRelevance}%</span>
                                    <div className="w-full bg-gray-200 h-1 rounded-full mt-1 overflow-hidden">
                                        <div className="bg-purple-600 h-1 rounded-full" style={{ width: `${portfolioRelevance}%` }} />
                                    </div>
                                </div>
                                <div className="p-2 rounded-lg bg-gray-50 border border-gray-100 text-center">
                                    <span className="text-[10px] text-gray-500 font-medium block">Experience (20%)</span>
                                    <span className="text-sm font-bold text-gray-900">{experience}%</span>
                                    <div className="w-full bg-gray-200 h-1 rounded-full mt-1 overflow-hidden">
                                        <div className="bg-blue-600 h-1 rounded-full" style={{ width: `${experience}%` }} />
                                    </div>
                                </div>
                                <div className="p-2 rounded-lg bg-gray-50 border border-gray-100 text-center">
                                    <span className="text-[10px] text-gray-500 font-medium block">Availability (15%)</span>
                                    <span className="text-sm font-bold text-gray-900">{availability}%</span>
                                    <div className="w-full bg-gray-200 h-1 rounded-full mt-1 overflow-hidden">
                                        <div className="bg-emerald-600 h-1 rounded-full" style={{ width: `${availability}%` }} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Strengths and Missing Skills */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        {strengths.length > 0 && (
                            <div className="p-2.5 bg-emerald-50/50 rounded-lg border border-emerald-100">
                                <span className="font-semibold text-emerald-900 flex items-center gap-1 mb-1.5 text-[11px]">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Key Strengths
                                </span>
                                <div className="flex flex-wrap gap-1">
                                    {strengths.map((str, idx) => (
                                        <span key={idx} className="inline-block px-2 py-0.5 bg-white text-emerald-800 rounded border border-emerald-200 text-[11px] font-medium">
                                            {str}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {missingSkills.length > 0 && (
                            <div className="p-2.5 bg-amber-50/50 rounded-lg border border-amber-100">
                                <span className="font-semibold text-amber-900 flex items-center gap-1 mb-1.5 text-[11px]">
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Missing / Required Skills
                                </span>
                                <div className="flex flex-wrap gap-1">
                                    {missingSkills.map((sk, idx) => (
                                        <span key={idx} className="inline-block px-2 py-0.5 bg-white text-amber-800 rounded border border-amber-200 text-[11px] font-medium">
                                            {sk}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Manual override information if present */}
                    {application.manual_override === 1 && application.override_reason && (
                        <div className="p-2.5 bg-purple-50 rounded-lg border border-purple-200 text-purple-900 text-xs">
                            <span className="font-bold block">Coordinator Override Note:</span>
                            <p className="italic mt-0.5">"{application.override_reason}"</p>
                            {application.overridden_at && (
                                <span className="text-[10px] text-purple-600 block mt-1">
                                    Overridden on {new Date(application.overridden_at).toLocaleString()}
                                </span>
                            )}
                        </div>
                    )}

                    <p className="text-[10px] text-gray-400 italic">
                        AI screening assists human reviewers by evaluating role alignment. Final selections are made by club coordinators.
                    </p>
                </div>
            )}

            {/* Coordinator Override Modal */}
            {showOverrideModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
                    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-gray-100">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                                <ShieldAlert size={20} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">Override AI Screening</h3>
                                <p className="text-xs text-gray-500">Manually update application status and record review reasoning</p>
                            </div>
                        </div>

                        <form onSubmit={handleOverrideSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">
                                    Target Application Status
                                </label>
                                <select
                                    value={overrideStatus}
                                    onChange={e => setOverrideStatus(e.target.value)}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white text-gray-900"
                                >
                                    <option value="Under Review">Under Review</option>
                                    <option value="Shortlisted">Shortlisted</option>
                                    <option value="Selected">Selected</option>
                                    <option value="Rejected">Rejected</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">
                                    Override Reason / Reviewer Context <span className="text-rose-500">*</span>
                                </label>
                                <textarea
                                    value={overrideReason}
                                    onChange={e => setOverrideReason(e.target.value)}
                                    rows="3"
                                    required
                                    placeholder="Explain why the AI evaluation or rejection was overridden (e.g. strong practical portfolio, domain transfer, interview recommendation)..."
                                    className="w-full border border-gray-300 rounded-lg p-2.5 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                />
                            </div>

                            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                                <button
                                    type="button"
                                    onClick={() => setShowOverrideModal(false)}
                                    disabled={overriding}
                                    className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={overriding || !overrideReason.trim()}
                                    className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50 transition"
                                >
                                    {overriding ? 'Saving Override...' : 'Confirm Override'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
