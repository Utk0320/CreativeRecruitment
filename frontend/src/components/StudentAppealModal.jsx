import React, { useState } from 'react';
import api from '../api';

const StudentAppealModal = ({ application, isOpen, onClose, onAppealSubmitted }) => {
    const [reason, setReason] = useState('');
    const [attachmentUrl, setAttachmentUrl] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    if (!isOpen || !application) return null;

    const windowDays = application.appeal_window_days || 7;
    const decisionTime = application.decision_date ? new Date(application.decision_date).getTime() : new Date(application.updated_at || Date.now()).getTime();
    const expiresAt = decisionTime + windowDays * 24 * 3600 * 1000;
    const msRemaining = Math.max(0, expiresAt - Date.now());
    const daysRemaining = Math.ceil(msRemaining / (24 * 3600 * 1000));

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (reason.trim().length < 10) {
            setError('Please provide a detailed explanation of at least 10 characters.');
            return;
        }

        setSubmitting(true);
        setError(null);

        try {
            const res = await api.post(`/appeals/applications/${application.id}`, {
                reason: reason.trim(),
                attachment_url: attachmentUrl.trim() || undefined
            });
            onAppealSubmitted(res.data);
            onClose();
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to submit appeal. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between pb-4 border-b border-gray-100 gap-2">
                    <div className="flex items-center space-x-3 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-lg shrink-0">
                            ⚖️
                        </div>
                        <div className="min-w-0 flex-1">
                            <h3 className="text-lg font-bold text-gray-900">File Recruitment Appeal</h3>
                            <p className="text-xs text-gray-500 break-words">{application.drive_title} • {application.club_name}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                        ✕
                    </button>
                </div>

                <div className="mt-4 p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl flex items-start space-x-2.5 text-xs text-amber-900">
                    <span className="text-sm">⏳</span>
                    <div>
                        <p className="font-semibold">Appeal Window: {daysRemaining} days remaining</p>
                        <p className="text-amber-800/90 mt-0.5">
                            Decisions can be appealed within {windowDays} days. Each student is permitted <strong>one official appeal</strong> per application.
                        </p>
                    </div>
                </div>

                {application.rejection_reason_code && (
                    <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-700">
                        <span className="font-semibold text-gray-900">Original Review Feedback: </span>
                        <span className="capitalize">{application.rejection_reason_code.replace('_', ' ')}</span>
                        {application.rejection_feedback && (
                            <p className="mt-1 text-gray-600 italic">"{application.rejection_feedback}"</p>
                        )}
                    </div>
                )}

                {error && (
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center space-x-2">
                        <span>⚠️</span>
                        <span>{error}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                            Reason for Appeal <span className="text-red-500">*</span>
                        </label>
                        <textarea
                            rows={4}
                            required
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Explain why your application merits re-evaluation (e.g. supplementary portfolio updates, clarification on task submissions)..."
                            className="w-full text-xs p-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                        />
                        <div className="flex justify-between items-center text-[10px] text-gray-400 mt-1">
                            <span>Minimum 10 characters</span>
                            <span className={reason.length >= 10 ? 'text-green-600 font-medium' : 'text-gray-400'}>
                                {reason.length} / 10 min
                            </span>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                            Supporting Attachment or Portfolio Link (Optional)
                        </label>
                        <input
                            type="url"
                            value={attachmentUrl}
                            onChange={(e) => setAttachmentUrl(e.target.value)}
                            placeholder="https://github.com/... or Google Drive link"
                            className="w-full text-xs p-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                        />
                    </div>

                    <div className="pt-2 flex items-center justify-end space-x-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-xl text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submitting || reason.trim().length < 10}
                            className="px-5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                            {submitting ? 'Submitting...' : 'Submit Official Appeal'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default StudentAppealModal;
