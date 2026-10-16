import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from '../api';
import { ShieldCheck, Award, Building, Calendar, CheckCircle, Copy, Check, ExternalLink, ArrowLeft, AlertCircle } from 'lucide-react';

const VerifyCertificate = () => {
    const { hash } = useParams();
    const [cert, setCert] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!hash) return;
        setLoading(true);
        setError('');
        axios.get(`/lifecycle/certificates/verify/${hash}`)
            .then(res => setCert(res.data))
            .catch(err => setError(err.response?.data?.error || 'Certificate credential could not be verified'))
            .finally(() => setLoading(false));
    }, [hash]);

    const handleCopy = () => {
        if (!hash) return;
        navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="text-center">
                    <div className="animate-spin w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                    <p className="text-sm text-gray-500 font-medium">Cryptographically verifying credential on MMCOE registry…</p>
                </div>
            </div>
        );
    }

    if (error || !cert) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-white rounded-3xl p-8 shadow-xl border border-red-100 text-center">
                    <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertCircle size={32} />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Invalid Credential</h2>
                    <p className="text-sm text-gray-600 mb-6">
                        {error || 'This credential hash does not correspond to any issued club certificate.'}
                    </p>
                    <div className="font-mono text-xs bg-gray-50 p-2.5 rounded-xl border border-gray-200 text-gray-500 break-all mb-6">
                        {hash}
                    </div>
                    <Link
                        to="/"
                        className="inline-flex items-center justify-center gap-2 w-full py-3 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 transition"
                    >
                        <ArrowLeft size={16} /> Return to Home
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-900 py-12 px-4 sm:px-6 lg:px-8 flex flex-col justify-center items-center">
            <div className="max-w-2xl w-full">
                {/* Back link */}
                <div className="mb-6 flex items-center justify-between">
                    <Link to="/" className="inline-flex items-center gap-2 text-slate-300 hover:text-white text-sm font-medium transition">
                        <ArrowLeft size={16} /> Back to CreativeRecruit
                    </Link>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        <CheckCircle size={14} /> Cryptographically Verified
                    </span>
                </div>

                {/* Main Certificate Card */}
                <div className="bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 relative">
                    {/* Decorative Top Border */}
                    <div className="h-3 bg-gradient-to-r from-indigo-600 via-purple-600 to-amber-500" />

                    <div className="p-8 sm:p-12 text-center relative">
                        {/* Watermark / Badge */}
                        <div className="mx-auto w-20 h-20 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-sm mb-6">
                            <Award size={44} />
                        </div>

                        <div className="uppercase tracking-widest text-xs font-bold text-indigo-600 mb-2">
                            Marathwada Mitra Mandal's College of Engineering
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight mb-2 break-words">
                            {cert.title}
                        </h1>
                        <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-8">
                            Official Club Recognition & Credential
                        </p>

                        <div className="my-8 py-6 border-y border-dashed border-gray-200">
                            <p className="text-sm text-gray-500 mb-1">This certifies that</p>
                            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 font-serif break-words">
                                {cert.recipient.name}
                            </h2>
                            <p className="text-xs text-gray-600 mt-1">
                                Department of {cert.recipient.department || 'Engineering'} • Year {cert.recipient.year || '—'}
                            </p>
                            <p className="text-sm text-gray-600 mt-4 max-w-lg mx-auto break-words">
                                has been officially recognized for active participation and distinguished contributions in <span className="font-bold text-gray-900">{cert.club.name}</span>.
                            </p>
                        </div>

                        {/* Metadata Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-left text-xs bg-gray-50 rounded-2xl p-4 border border-gray-100 mb-8">
                            <div>
                                <span className="text-gray-400 block text-[11px] mb-0.5">Club Organization</span>
                                <span className="font-semibold text-gray-800 flex items-center gap-1 break-words">
                                    <Building size={13} className="text-gray-400 shrink-0" /> {cert.club.name}
                                </span>
                            </div>
                            <div>
                                <span className="text-gray-400 block text-[11px] mb-0.5">Date of Issue</span>
                                <span className="font-semibold text-gray-800 flex items-center gap-1">
                                    <Calendar size={13} className="text-gray-400 shrink-0" /> {cert.issue_date}
                                </span>
                            </div>
                            <div className="col-span-2 sm:col-span-1">
                                <span className="text-gray-400 block text-[11px] mb-0.5">Issued Authorized By</span>
                                <span className="font-semibold text-gray-800 flex items-center gap-1 break-words">
                                    <ShieldCheck size={13} className="text-emerald-500 shrink-0" /> {cert.issued_by}
                                </span>
                            </div>
                        </div>

                        {/* Cryptographic Hash Verification Seal */}
                        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 text-left">
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                                    <ShieldCheck size={14} className="text-indigo-600" />
                                    SHA-256 Credential Hash
                                </span>
                                <button
                                    type="button"
                                    onClick={handleCopy}
                                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"
                                >
                                    {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                                    <span>{copied ? 'Copied Link' : 'Copy Verification Link'}</span>
                                </button>
                            </div>
                            <div className="font-mono text-[11px] text-slate-500 break-all select-all">
                                {cert.unique_credential_hash}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-6 text-center text-xs text-slate-400">
                    Verified through CreativeRecruit Public Credential Registry • MMCOE Pune
                </div>
            </div>
        </div>
    );
};

export default VerifyCertificate;

