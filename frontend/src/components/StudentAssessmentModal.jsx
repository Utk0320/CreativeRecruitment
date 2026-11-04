import React, { useState, useEffect, useCallback } from 'react';
import axios from '../api';
import { Clock, CheckCircle, Send } from 'lucide-react';

export default function StudentAssessmentModal({ application, onClose, onSubmitted }) {
    const [test, setTest] = useState(null);
    const [statusData, setStatusData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [answers, setAnswers] = useState({});
    const [remainingSeconds, setRemainingSeconds] = useState(null);
    const [submissionResult, setSubmissionResult] = useState(null);
    const [error, setError] = useState('');

    const handleSubmitAnswers = useCallback(async () => {
        try {
            setSubmitting(true);
            const res = await axios.post(`/tests/applications/${application.id}/submit`, { answers });
            setSubmissionResult(res.data);
            if (onSubmitted) onSubmitted();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to submit answers');
        } finally {
            setSubmitting(false);
        }
    }, [application.id, answers, onSubmitted]);

    useEffect(() => {
        let isMounted = true;

        const loadData = async () => {
            try {
                setLoading(true);
                setError('');
                const [testRes, statusRes] = await Promise.all([
                    axios.get(`/tests/drive/${application.drive_id}`),
                    axios.get(`/tests/applications/${application.id}/status`)
                ]);

                if (!isMounted) return;
                setTest(testRes.data);
                setStatusData(statusRes.data);

                if (statusRes.data?.has_attempt && statusRes.data.status === 'in_progress') {
                    setRemainingSeconds(statusRes.data.remaining_seconds);
                }
            } catch (err) {
                if (isMounted) setError(err.response?.data?.error || 'Failed to load assessment');
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        loadData();

        return () => {
            isMounted = false;
        };
    }, [application.id, application.drive_id]);

    // Live countdown timer
    useEffect(() => {
        if (remainingSeconds === null || remainingSeconds <= 0) return;

        const timer = setInterval(() => {
            setRemainingSeconds(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    handleSubmitAnswers(); // Auto-submit when timer expires
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [remainingSeconds, handleSubmitAnswers]);

    const handleStartTest = async () => {
        try {
            setLoading(true);
            setError('');
            const res = await axios.post(`/tests/applications/${application.id}/start`);
            setStatusData(prev => ({
                ...prev,
                has_attempt: true,
                status: 'in_progress',
                duration_minutes: res.data.duration_minutes
            }));
            setRemainingSeconds(res.data.duration_minutes * 60);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to start assessment');
        } finally {
            setLoading(false);
        }
    };

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-gray-100 overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 bg-gradient-to-r from-blue-700 to-indigo-700 text-white flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <h2 className="text-lg font-bold break-words">
                            {test?.title || 'Skill Assessment & Test'}
                        </h2>
                        <p className="text-xs text-blue-100 mt-0.5 break-words">
                            {application.club_name} · {application.drive_title}
                        </p>
                    </div>

                    {/* Timer Badge */}
                    {remainingSeconds !== null && statusData?.status === 'in_progress' && (
                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono font-bold shadow-sm shrink-0 ${
                            remainingSeconds < 300 ? 'bg-red-500 text-white animate-pulse' : 'bg-white/20 text-white'
                        }`}>
                            <Clock className="w-4 h-4" />
                            <span>{formatTime(remainingSeconds)}</span>
                        </div>
                    )}
                </div>

                {/* Modal Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {loading ? (
                        <div className="py-16 text-center text-gray-500">
                            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                            Loading assessment details...
                        </div>
                    ) : error ? (
                        <div className="p-4 bg-red-50 text-red-700 rounded-xl text-xs">{error}</div>
                    ) : submissionResult ? (
                        <div className="text-center py-10 space-y-4">
                            <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                                <CheckCircle className="w-8 h-8" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900">Assessment Submitted!</h3>
                            <p className="text-xs text-gray-500 max-w-md mx-auto">
                                {submissionResult.message}
                            </p>
                            {submissionResult.auto_graded_score !== undefined && (
                                <div className="inline-block p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
                                    <span className="text-xs text-indigo-700 font-bold uppercase">MCQ Auto Score</span>
                                    <div className="text-3xl font-black text-indigo-900 mt-1">
                                        {submissionResult.auto_graded_score} pts
                                    </div>
                                    {submissionResult.requires_manual_grading && (
                                        <p className="text-[11px] text-gray-500 mt-1">
                                            (Short-answer questions are pending coordinator evaluation)
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : !statusData?.has_attempt ? (
                        <div className="text-center py-8 space-y-4">
                            <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center mx-auto">
                                <Clock className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">{test?.title}</h3>
                                <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
                                    {test?.description || 'Complete the timed questions below. Your score will be attached to your application for review.'}
                                </p>
                            </div>

                            <div className="inline-flex gap-4 p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs text-gray-700">
                                <div><strong>Duration:</strong> {test?.duration_minutes || 60} Minutes</div>
                                <div><strong>Total Points:</strong> {test?.total_points || 100}</div>
                                <div><strong>Questions:</strong> {test?.questions?.length || 0}</div>
                            </div>

                            <div>
                                <button
                                    onClick={handleStartTest}
                                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md"
                                >
                                    Start Assessment Now
                                </button>
                            </div>
                        </div>
                    ) : statusData?.status === 'in_progress' ? (
                        <div className="space-y-6">
                            {test?.questions?.map((q, idx) => (
                                <div key={q.id || idx} className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <span className="text-xs font-bold text-gray-900">
                                            Question {idx + 1} ({q.points || 10} pts)
                                        </span>
                                        <span className="text-[10px] uppercase font-bold text-gray-400 bg-white px-2 py-0.5 rounded border">
                                            {q.type}
                                        </span>
                                    </div>
                                    <p className="text-sm text-gray-800">{q.prompt}</p>

                                    {/* MCQ Question */}
                                    {q.type === 'mcq' && (
                                        <div className="space-y-2 pt-1">
                                            {q.options?.map((opt, oIdx) => (
                                                <label
                                                    key={oIdx}
                                                    className={`flex items-center gap-3 p-3 rounded-lg border text-xs cursor-pointer transition-colors ${
                                                        answers[q.id] === opt ? 'bg-indigo-50 border-indigo-400 font-semibold' : 'bg-white border-gray-200 hover:bg-gray-50'
                                                    }`}
                                                >
                                                    <input
                                                        type="radio"
                                                        name={`q_${q.id}`}
                                                        value={opt}
                                                        checked={answers[q.id] === opt}
                                                        onChange={() => setAnswers(prev => ({ ...prev, [q.id]: opt }))}
                                                        className="text-indigo-600 focus:ring-indigo-500"
                                                    />
                                                    <span>{opt}</span>
                                                </label>
                                            ))}
                                        </div>
                                    )}

                                    {/* Short Answer / Text */}
                                    {q.type !== 'mcq' && (
                                        <textarea
                                            rows={3}
                                            value={answers[q.id] || ''}
                                            onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                                            placeholder="Write your answer or paste your GitHub/portfolio link..."
                                            className="w-full text-xs p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8 space-y-3">
                            <h3 className="text-base font-bold text-gray-900">Assessment Completed</h3>
                            <p className="text-xs text-gray-500">
                                Status: <strong className="capitalize">{statusData.status}</strong>
                            </p>
                            {statusData.score !== null && (
                                <div className="inline-block p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
                                    <span className="text-xs text-indigo-700 font-bold uppercase">Recorded Score</span>
                                    <div className="text-2xl font-black text-indigo-900 mt-0.5">
                                        {statusData.score} / {statusData.total_points || 100}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-200 rounded-lg"
                    >
                        Close
                    </button>

                    {statusData?.status === 'in_progress' && !submissionResult && (
                        <button
                            onClick={() => {
                                if (window.confirm('Are you ready to submit your assessment? You cannot change answers after submission.')) {
                                    handleSubmitAnswers(false);
                                }
                            }}
                            disabled={submitting}
                            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-1.5"
                        >
                            <Send className="w-3.5 h-3.5" />
                            {submitting ? 'Submitting...' : 'Submit Assessment'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
