import React, { useState, useEffect } from 'react';
import { X, Download, ShieldAlert, Trash2, FileJson, FileSpreadsheet, CheckCircle, AlertTriangle } from 'lucide-react';
import api from '../api';

const DataPrivacyModal = ({ isOpen, onClose, user }) => {
    const [downloadingJson, setDownloadingJson] = useState(false);
    const [downloadingCsv, setDownloadingCsv] = useState(false);
    const [reason, setReason] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [notice, setNotice] = useState('');
    const [error, setError] = useState('');
    const [existingRequest, setExistingRequest] = useState(null);

    useEffect(() => {
        if (!isOpen) {
            setNotice('');
            setError('');
            setReason('');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleDownloadJson = async () => {
        setDownloadingJson(true);
        setError('');
        try {
            const res = await api.get('/privacy/my-data');
            const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(res.data, null, 2));
            const downloadAnchor = document.createElement('a');
            downloadAnchor.setAttribute('href', dataStr);
            downloadAnchor.setAttribute('download', `creative_recruit_profile_${user?.id || 'export'}.json`);
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
            downloadAnchor.remove();
            setNotice('Personal data JSON export generated successfully.');
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to download data export.');
        } finally {
            setDownloadingJson(false);
        }
    };

    const handleDownloadCsv = async () => {
        setDownloadingCsv(true);
        setError('');
        try {
            const res = await api.get('/privacy/my-data/csv', { responseType: 'blob' });
            const blob = new Blob([res.data], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `my_applications_summary.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            setNotice('Applications summary CSV downloaded successfully.');
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to download CSV export.');
        } finally {
            setDownloadingCsv(false);
        }
    };

    const handleDeleteRequest = async (e) => {
        e.preventDefault();
        if (reason.trim().length < 10) {
            setError('Please provide a reason of at least 10 characters.');
            return;
        }
        setSubmitting(true);
        setError('');
        setNotice('');
        try {
            const res = await api.post('/privacy/delete-request', { reason: reason.trim() });
            setNotice(res.data.message || 'Deletion request submitted for administrative review.');
            setReason('');
            setExistingRequest({ status: 'pending' });
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to submit deletion request.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
            <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl border border-gray-200 my-8">
                {/* Header */}
                <div className="flex items-center justify-between pb-4 border-b border-gray-100 mb-5">
                    <div className="flex items-center space-x-2 min-w-0 flex-1">
                        <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 shrink-0">
                            <ShieldAlert size={20} />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-lg font-bold text-gray-900 break-words">Data Privacy & Subject Access Rights</h3>
                            <p className="text-xs text-gray-500">Manage your data exports and right-to-be-forgotten requests</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                        aria-label="Close modal"
                    >
                        <X size={18} />
                    </button>
                </div>

                {notice && (
                    <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-800 flex items-center gap-2">
                        <CheckCircle size={16} className="text-emerald-600 shrink-0" />
                        <span>{notice}</span>
                    </div>
                )}
                {error && (
                    <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-800 flex items-center gap-2">
                        <AlertTriangle size={16} className="text-red-600 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {/* Section 1: Subject Access Request Exports */}
                <div className="mb-6 rounded-xl border border-gray-200 bg-gray-50/50 p-4">
                    <h4 className="text-sm font-bold text-gray-900 mb-1 flex items-center gap-1.5">
                        <Download size={16} className="text-indigo-600" /> Export Personal Records (SAR)
                    </h4>
                    <p className="text-xs text-gray-600 mb-3">
                        In accordance with DPDP and GDPR data portability principles, you can download a complete copy of your applicant profile, submitted answers, and timeline.
                    </p>

                    <div className="flex flex-wrap gap-2.5">
                        <button
                            type="button"
                            onClick={handleDownloadJson}
                            disabled={downloadingJson}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-gray-300 hover:border-indigo-400 text-gray-800 text-xs font-semibold rounded-xl shadow-xs hover:bg-indigo-50/50 transition-colors disabled:opacity-60"
                        >
                            <FileJson size={15} className="text-indigo-600" />
                            {downloadingJson ? 'Exporting JSON…' : 'Full Profile (JSON)'}
                        </button>

                        <button
                            type="button"
                            onClick={handleDownloadCsv}
                            disabled={downloadingCsv}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-gray-300 hover:border-emerald-400 text-gray-800 text-xs font-semibold rounded-xl shadow-xs hover:bg-emerald-50/50 transition-colors disabled:opacity-60"
                        >
                            <FileSpreadsheet size={15} className="text-emerald-600" />
                            {downloadingCsv ? 'Exporting CSV…' : 'Applications Log (CSV)'}
                        </button>
                    </div>
                </div>

                {/* Section 2: Account Anonymization & Right to Be Forgotten */}
                <div className="rounded-xl border border-amber-200 bg-amber-50/30 p-4">
                    <h4 className="text-sm font-bold text-gray-900 mb-1 flex items-center gap-1.5 text-amber-900">
                        <Trash2 size={16} className="text-amber-700" /> Request Account Deletion / Anonymization
                    </h4>
                    <p className="text-xs text-gray-600 mb-3">
                        Submitting this request alerts the college administrator to permanently redact your name, email, phone, PRN, resume, and profile links. Historical logs will be cryptographically anonymized.
                    </p>

                    {existingRequest?.status === 'pending' ? (
                        <div className="p-3 bg-amber-100/70 border border-amber-300 rounded-xl text-xs text-amber-900 font-medium flex items-center gap-2">
                            <AlertTriangle size={15} className="shrink-0 text-amber-700" />
                            <span>Your anonymization request has been submitted and is currently pending administrator approval.</span>
                        </div>
                    ) : (
                        <form onSubmit={handleDeleteRequest} className="space-y-3">
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">
                                    Reason for Deletion * (minimum 10 characters)
                                </label>
                                <textarea
                                    required
                                    rows={3}
                                    placeholder="e.g. Graduated from college / Withdrawing all club candidate data..."
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    className="w-full rounded-xl border border-gray-300 p-2.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                                />
                            </div>

                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="rounded-xl border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting || reason.trim().length < 10}
                                    className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition-colors shadow-xs"
                                >
                                    <Trash2 size={14} />
                                    {submitting ? 'Submitting…' : 'Submit Deletion Request'}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DataPrivacyModal;

