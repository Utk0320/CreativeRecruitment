import React, { useState, useEffect } from 'react';
import axios from '../api';

export default function AdminAudit() {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [actionFilter, setActionFilter] = useState('');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const limit = 20;

    const fetchAuditLogs = async () => {
        try {
            setLoading(true);
            setError(null);
            const params = {
                limit,
                offset: (page - 1) * limit
            };
            if (actionFilter) params.action = actionFilter;
            if (fromDate) params.from_date = fromDate;
            if (toDate) params.to_date = toDate;

            const res = await axios.get('/admin/audit', { params });
            setLogs(res.data || []);
            const totalCount = Number(res.headers['x-total-count'] || res.data.length);
            setTotal(totalCount);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to load audit records');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAuditLogs();
    }, [page, actionFilter, fromDate, toDate]);

    const handleExportCsv = async () => {
        try {
            const params = {};
            if (actionFilter) params.action = actionFilter;
            if (fromDate) params.from_date = fromDate;
            if (toDate) params.to_date = toDate;

            const res = await axios.get('/admin/audit/export-csv', {
                params,
                responseType: 'blob'
            });

            const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'admin_audit_log.csv');
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (err) {
            alert('Failed to export CSV: ' + (err.message || 'Error'));
        }
    };

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 pb-5">
                <div>
                    <h1 className="text-2xl font-black text-gray-900 tracking-tight">System Audit Log</h1>
                    <p className="text-sm text-gray-500 mt-1">Append-only administrative audit trail across all clubs, drives, and applications.</p>
                </div>
                <button
                    onClick={handleExportCsv}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm rounded-xl shadow-sm transition-all"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    Export Full CSV
                </button>
            </div>

            {/* Filter Bar */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-wrap items-center gap-4 text-xs">
                <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-700">Filter Action:</span>
                    <input
                        type="text"
                        value={actionFilter}
                        onChange={e => { setActionFilter(e.target.value); setPage(1); }}
                        placeholder="e.g. application, drive, club"
                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-700">From Date:</span>
                    <input
                        type="date"
                        value={fromDate}
                        onChange={e => { setFromDate(e.target.value); setPage(1); }}
                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-700">To Date:</span>
                    <input
                        type="date"
                        value={toDate}
                        onChange={e => { setToDate(e.target.value); setPage(1); }}
                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs"
                    />
                </div>
                {(actionFilter || fromDate || toDate) && (
                    <button
                        onClick={() => { setActionFilter(''); setFromDate(''); setToDate(''); setPage(1); }}
                        className="text-xs text-blue-600 hover:underline font-semibold"
                    >
                        Reset filters
                    </button>
                )}
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {loading ? (
                    <div className="p-12 text-center text-gray-500">
                        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                        Loading audit trail...
                    </div>
                ) : error ? (
                    <div className="p-6 bg-red-50 text-red-700 text-sm">{error}</div>
                ) : logs.length === 0 ? (
                    <div className="p-12 text-center text-gray-400 italic">No audit records found matching your filters.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase tracking-wider">
                                <tr>
                                    <th className="px-4 py-3">ID</th>
                                    <th className="px-4 py-3">Timestamp</th>
                                    <th className="px-4 py-3">Actor</th>
                                    <th className="px-4 py-3">Role</th>
                                    <th className="px-4 py-3">Action</th>
                                    <th className="px-4 py-3">Entity</th>
                                    <th className="px-4 py-3">Club</th>
                                    <th className="px-4 py-3">IP</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 font-medium">
                                {logs.map(log => (
                                    <tr key={log.id} className="hover:bg-gray-50/80 transition-colors">
                                        <td className="px-4 py-3 text-gray-400 font-mono">#{log.id}</td>
                                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                                            {new Date(log.created_at).toLocaleString()}
                                        </td>
                                        <td className="px-4 py-3 font-bold text-gray-900">
                                            {log.actor_name || log.actor_email || 'System'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-gray-100 text-gray-700">
                                                {log.actor_role || 'system'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 font-mono font-bold text-blue-700">
                                            {log.action}
                                        </td>
                                        <td className="px-4 py-3 text-gray-600">
                                            {log.entity_type} #{log.entity_id}
                                        </td>
                                        <td className="px-4 py-3 text-gray-700 font-semibold">
                                            {log.club_name || '-'}
                                        </td>
                                        <td className="px-4 py-3 text-gray-400 font-mono text-[11px]">
                                            {log.ip || '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Pagination */}
                <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-xs text-gray-600">
                    <div>
                        Showing {logs.length} of {total} records
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="px-3 py-1 bg-white border border-gray-300 rounded font-bold disabled:opacity-40"
                        >
                            Previous
                        </button>
                        <span className="px-2 py-1 font-bold">Page {page}</span>
                        <button
                            onClick={() => setPage(p => p + 1)}
                            disabled={logs.length < limit}
                            className="px-3 py-1 bg-white border border-gray-300 rounded font-bold disabled:opacity-40"
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
