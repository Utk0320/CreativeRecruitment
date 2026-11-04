import React, { useMemo, useState, useEffect } from 'react';
import axios from '../api';
import { useAuth } from '../context/AuthContext';
import ApplicationCollaborationModal from './ApplicationCollaborationModal';
import {
    normalizeStages,
    OUTCOMES,
    REASON_CODES,
    REASON_LABELS,
    OUTCOME_BADGES
} from '../utils/pipelineTransitions';
import {
    ArrowRight, CheckSquare, Download, Filter,
    Layers, MessageSquare, MoreVertical, RefreshCw, Search, Square, User, X
} from 'lucide-react';

const KanbanBoard = ({ drive, applications = [], onRefresh, onViewProfile }) => {
    const { user } = useAuth();
    const stages = useMemo(() => normalizeStages(drive?.stages), [drive?.stages]);

    // Filtering & Search
    const [search, setSearch] = useState('');
    const [outcomeFilter, setOutcomeFilter] = useState('All');
    const [deptFilter, setDeptFilter] = useState('All');
    const [yearFilter, setYearFilter] = useState('All');
    const [assignedFilter, setAssignedFilter] = useState('All'); // 'All' | 'me'

    // Collaboration & assignments state
    const [activeCollabAppId, setActiveCollabAppId] = useState(null);
    const [assignments, setAssignments] = useState([]);
    const [clubMembers, setClubMembers] = useState([]);

    useEffect(() => {
        if (!drive?.id) return;
        axios.get(`/applications/drive/${drive.id}/assignments`).then(r => setAssignments(r.data || [])).catch(() => {});
        if (drive.club_id) {
            axios.get(`/clubs/${drive.club_id}/members`).then(r => setClubMembers(r.data || [])).catch(() => {});
        }
    }, [drive?.id, drive?.club_id]);

    const myAssignedAppIds = useMemo(() => {
        return new Set(assignments.filter(a => a.reviewer_id === user?.id).map(a => a.application_id));
    }, [assignments, user?.id]);

    const appAssignments = useMemo(() => {
        const map = {};
        assignments.forEach(a => {
            if (!map[a.application_id]) map[a.application_id] = [];
            map[a.application_id].push(a);
        });
        return map;
    }, [assignments]);

    // Selection for bulk actions
    const [selectedIds, setSelectedIds] = useState(new Set());

    // Single / Bulk Action Modal state (for Reason Code & Feedback)
    const [actionModal, setActionModal] = useState({
        isOpen: false,
        isBulk: false,
        appId: null,
        targetOutcome: 'Rejected', // 'Rejected' or 'Waitlisted'
        targetStageId: null,
        reasonCode: 'skill_mismatch',
        feedback: ''
    });

    // Move menu popover open state: { [appId]: boolean }
    const [openMoveMenuId, setOpenMoveMenuId] = useState(null);

    // Loading / error states
    const [actionLoading, setActionLoading] = useState(false);
    const [actionError, setActionError] = useState('');
    const [actionSuccess, setActionSuccess] = useState('');
    const [exporting, setExporting] = useState(false);

    // Extract unique departments & years for filters
    const departments = useMemo(() => {
        const set = new Set(applications.map(a => a.department).filter(Boolean));
        return Array.from(set);
    }, [applications]);

    // Filtered applications
    const filteredApps = useMemo(() => {
        return applications.filter(app => {
            if (outcomeFilter !== 'All' && app.outcome !== outcomeFilter) return false;
            if (deptFilter !== 'All' && app.department !== deptFilter) return false;
            if (yearFilter !== 'All' && String(app.year) !== String(yearFilter)) return false;
            if (assignedFilter === 'me' && !myAssignedAppIds.has(app.id)) return false;
            if (search.trim()) {
                const q = search.toLowerCase();
                const name = (app.student_name || '').toLowerCase();
                const email = (app.email || '').toLowerCase();
                const motiv = (app.motivation || '').toLowerCase();
                if (!name.includes(q) && !email.includes(q) && !motiv.includes(q)) return false;
            }
            return true;
        });
    }, [applications, outcomeFilter, deptFilter, yearFilter, assignedFilter, myAssignedAppIds, search]);

    const handleAutoBalance = async () => {
        if (!confirm('Auto-balance unassigned candidates equally among active club members?')) return;
        setActionLoading(true);
        setActionError('');
        setActionSuccess('');
        try {
            const res = await axios.post(`/applications/drive/${drive.id}/auto-balance`);
            setActionSuccess(res.data?.message || 'Auto-balance complete');
            const assignRes = await axios.get(`/applications/drive/${drive.id}/assignments`);
            setAssignments(assignRes.data || []);
            if (onRefresh) onRefresh();
        } catch (err) {
            setActionError(err.response?.data?.error || 'Failed to auto-balance');
        } finally {
            setActionLoading(false);
        }
    };

    // Group filtered applications by stage
    const stageColumns = useMemo(() => {
        const map = {};
        stages.forEach(s => { map[s.id] = []; });
        filteredApps.forEach(app => {
            const sId = app.current_stage_id || stages[0]?.id || 'screening';
            if (!map[sId]) map[sId] = [];
            map[sId].push(app);
        });
        return map;
    }, [stages, filteredApps]);

    // Selection handlers
    const toggleSelect = (id) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const selectAllVisible = () => {
        setSelectedIds(new Set(filteredApps.map(a => a.id)));
    };

    const clearSelection = () => {
        setSelectedIds(new Set());
    };

    // Execute single stage or outcome transition
    const handleMoveStage = async (appId, targetStageId, targetOutcome = null, reasonCode = null, feedback = null) => {
        setActionLoading(true);
        setActionError('');
        setActionSuccess('');
        try {
            const payload = {};
            if (targetStageId) payload.stage_id = targetStageId;
            if (targetOutcome) payload.outcome = targetOutcome;
            if (reasonCode) payload.rejection_reason_code = reasonCode;
            if (feedback !== null) payload.rejection_feedback = feedback;

            await axios.patch(`/applications/${appId}/stage`, payload);
            setActionSuccess('Applicant updated successfully');
            setOpenMoveMenuId(null);
            if (onRefresh) onRefresh();
        } catch (err) {
            setActionError(err.response?.data?.error || 'Failed to update applicant');
        } finally {
            setActionLoading(false);
        }
    };

    // Execute bulk stage / outcome transition
    const handleBulkMove = async (targetStageId, targetOutcome = null, reasonCode = null, feedback = null) => {
        if (selectedIds.size === 0) return;
        setActionLoading(true);
        setActionError('');
        setActionSuccess('');
        try {
            const payload = {
                application_ids: Array.from(selectedIds)
            };
            if (targetStageId) payload.stage_id = targetStageId;
            if (targetOutcome) payload.outcome = targetOutcome;
            if (reasonCode) payload.rejection_reason_code = reasonCode;
            if (feedback !== null) payload.rejection_feedback = feedback;

            const res = await axios.post('/applications/bulk-stage', payload);
            setActionSuccess(res.data?.message || 'Bulk update successful');
            clearSelection();
            if (onRefresh) onRefresh();
        } catch (err) {
            setActionError(err.response?.data?.error || 'Bulk update failed');
        } finally {
            setActionLoading(false);
        }
    };

    // Confirm action from modal (Rejection or Waitlist)
    const handleModalSubmit = async (e) => {
        e.preventDefault();
        const { isBulk, appId, targetOutcome, targetStageId, reasonCode, feedback } = actionModal;
        setActionModal(prev => ({ ...prev, isOpen: false }));
        if (isBulk) {
            await handleBulkMove(targetStageId, targetOutcome, reasonCode, feedback);
        } else {
            await handleMoveStage(appId, targetStageId, targetOutcome, reasonCode, feedback);
        }
    };

    // HTML5 Drag & Drop handlers
    const handleDragStart = (e, appId) => {
        e.dataTransfer.setData('text/plain', String(appId));
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = async (e, targetStageId) => {
        e.preventDefault();
        const appIdStr = e.dataTransfer.getData('text/plain');
        if (!appIdStr) return;
        const appId = Number(appIdStr);
        const app = applications.find(a => a.id === appId);
        if (!app || app.current_stage_id === targetStageId) return;

        // Move to target stage
        await handleMoveStage(appId, targetStageId);
    };

    // CSV Export
    const handleExportCsv = async () => {
        if (!drive?.id) return;
        setExporting(true);
        setActionError('');
        try {
            const res = await axios.get(`/applications/drive/${drive.id}/export-csv`, {
                responseType: 'blob'
            });
            const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `drive-${drive.id}-candidates.csv`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            setActionError(err.response?.data?.error || 'Failed to export CSV. Permission export.data required.');
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="space-y-4">
            {/* Header & Controls Toolbar */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-3">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <Layers className="w-5 h-5 text-indigo-600" />
                        <h2 className="text-lg font-bold text-gray-900">Candidate Pipeline & Kanban</h2>
                        <span className="text-xs bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full font-semibold border border-indigo-200">
                            {filteredApps.length} Applicants
                        </span>
                    </div>

                    {/* Action buttons: Export CSV & Selection toggle */}
                    <div className="flex items-center gap-2 flex-wrap">
                        {filteredApps.length > 0 && (
                            <button
                                onClick={selectedIds.size === filteredApps.length ? clearSelection : selectAllVisible}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition"
                            >
                                {selectedIds.size === filteredApps.length ? (
                                    <>
                                        <CheckSquare className="w-4 h-4 text-indigo-600" /> Deselect All
                                    </>
                                ) : (
                                    <>
                                        <Square className="w-4 h-4 text-gray-400" /> Select All ({filteredApps.length})
                                    </>
                                )}
                            </button>
                        )}
                        <button
                            onClick={handleAutoBalance}
                            disabled={actionLoading}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 transition shadow-sm disabled:opacity-50"
                            title="Evenly distribute unassigned applicants among club members"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${actionLoading ? 'animate-spin' : ''}`} />
                            Auto-Balance
                        </button>
                        <button
                            onClick={handleExportCsv}
                            disabled={exporting}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 transition shadow-sm disabled:opacity-50"
                        >
                            <Download className="w-3.5 h-3.5" />
                            {exporting ? 'Exporting...' : 'Export CSV'}
                        </button>
                    </div>
                </div>

                {/* Filters Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2 pt-2 border-t border-gray-100">
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search applicant..."
                            className="w-full pl-9 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                    </div>

                    <div className="flex items-center gap-1.5">
                        <Filter className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <select
                            value={outcomeFilter}
                            onChange={e => setOutcomeFilter(e.target.value)}
                            className="w-full py-1.5 px-2 text-xs border border-gray-300 rounded-lg bg-white text-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none"
                        >
                            <option value="All">All Outcomes</option>
                            {OUTCOMES.map(o => (
                                <option key={o} value={o}>{o}</option>
                            ))}
                        </select>
                    </div>

                    <select
                        value={deptFilter}
                        onChange={e => setDeptFilter(e.target.value)}
                        className="py-1.5 px-2 text-xs border border-gray-300 rounded-lg bg-white text-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                        <option value="All">All Departments</option>
                        {departments.map(d => (
                            <option key={d} value={d}>{d}</option>
                        ))}
                    </select>

                    <select
                        value={yearFilter}
                        onChange={e => setYearFilter(e.target.value)}
                        className="py-1.5 px-2 text-xs border border-gray-300 rounded-lg bg-white text-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                        <option value="All">All Years</option>
                        <option value="1">Year 1</option>
                        <option value="2">Year 2</option>
                        <option value="3">Year 3</option>
                        <option value="4">Year 4</option>
                    </select>

                    <button
                        type="button"
                        onClick={() => setAssignedFilter(prev => prev === 'me' ? 'All' : 'me')}
                        className={`py-1.5 px-2 text-xs font-semibold rounded-lg border transition flex items-center justify-center gap-1.5 ${
                            assignedFilter === 'me'
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        }`}
                    >
                        <User className="w-3.5 h-3.5" />
                        <span>{assignedFilter === 'me' ? 'Assigned to Me' : 'All Reviewers'}</span>
                        {myAssignedAppIds.size > 0 && (
                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                                assignedFilter === 'me' ? 'bg-indigo-800 text-white' : 'bg-gray-100 text-gray-700'
                            }`}>
                                {myAssignedAppIds.size}
                            </span>
                        )}
                    </button>
                </div>

                {/* Notifications & status banners */}
                {actionError && (
                    <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs flex justify-between items-center">
                        <span>{actionError}</span>
                        <button onClick={() => setActionError('')}><X className="w-4 h-4" /></button>
                    </div>
                )}
                {actionSuccess && (
                    <div className="p-2.5 bg-green-50 border border-green-200 text-green-700 rounded-lg text-xs flex justify-between items-center">
                        <span>{actionSuccess}</span>
                        <button onClick={() => setActionSuccess('')}><X className="w-4 h-4" /></button>
                    </div>
                )}

                {/* Bulk Action Sticky Bar */}
                {selectedIds.size > 0 && (
                    <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="font-semibold text-indigo-900 flex items-center gap-1.5">
                            <CheckSquare className="w-4 h-4 text-indigo-600" />
                            {selectedIds.size} applicant{selectedIds.size > 1 ? 's' : ''} selected
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-gray-500">Bulk action:</span>
                            {/* Move to Stage dropdown */}
                            <select
                                onChange={e => {
                                    if (e.target.value) handleBulkMove(e.target.value);
                                    e.target.value = '';
                                }}
                                defaultValue=""
                                className="py-1 px-2 border border-indigo-200 bg-white rounded font-medium text-gray-700"
                            >
                                <option value="" disabled>Move Stage...</option>
                                {stages.map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>

                            <button
                                onClick={() => handleBulkMove(null, 'Advanced')}
                                className="px-2.5 py-1 bg-white border border-blue-200 text-blue-700 rounded font-semibold hover:bg-blue-50"
                            >
                                Advance
                            </button>
                            <button
                                onClick={() => setActionModal({
                                    isOpen: true,
                                    isBulk: true,
                                    targetOutcome: 'Waitlisted',
                                    reasonCode: 'seat_limit',
                                    feedback: ''
                                })}
                                className="px-2.5 py-1 bg-white border border-purple-200 text-purple-700 rounded font-semibold hover:bg-purple-50"
                            >
                                Waitlist
                            </button>
                            <button
                                onClick={() => setActionModal({
                                    isOpen: true,
                                    isBulk: true,
                                    targetOutcome: 'Rejected',
                                    reasonCode: 'skill_mismatch',
                                    feedback: ''
                                })}
                                className="px-2.5 py-1 bg-white border border-rose-200 text-rose-700 rounded font-semibold hover:bg-rose-50"
                            >
                                Reject
                            </button>
                            <button
                                onClick={clearSelection}
                                className="text-gray-500 hover:text-gray-800 ml-1"
                            >
                                Clear
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Kanban Columns */}
            <div className="flex gap-4 overflow-x-auto pb-4 items-start min-w-0 -mx-1 px-1">
                {stages.map((stage, sIdx) => {
                    const appsInStage = stageColumns[stage.id] || [];
                    const isLastStage = sIdx === stages.length - 1;

                    return (
                        <div
                            key={stage.id}
                            onDragOver={handleDragOver}
                            onDrop={e => handleDrop(e, stage.id)}
                            className="bg-gray-100/80 rounded-xl p-3 border border-gray-200/80 min-h-[450px] flex flex-col transition w-72 sm:w-80 shrink-0"
                        >
                            {/* Column Header */}
                            <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-200">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                                        {sIdx + 1}
                                    </span>
                                    <h3 className="text-sm font-bold text-gray-800 truncate" title={stage.name}>
                                        {stage.name}
                                    </h3>
                                </div>
                                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white text-gray-600 border border-gray-200 shadow-2xs shrink-0 ml-2">
                                    {appsInStage.length}
                                </span>
                            </div>

                            {/* Card List in Stage */}
                            <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[650px] pr-0.5">
                                {appsInStage.length === 0 ? (
                                    <div className="h-28 border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center text-xs text-gray-400">
                                        Drop candidate here
                                    </div>
                                ) : (
                                    appsInStage.map(app => {
                                        const isChecked = selectedIds.has(app.id);
                                        const isMenuOpen = openMoveMenuId === app.id;

                                        return (
                                            <div
                                                key={app.id}
                                                draggable={true}
                                                onDragStart={e => handleDragStart(e, app.id)}
                                                className={`bg-white rounded-lg p-3 border shadow-2xs hover:shadow-md transition cursor-grab active:cursor-grabbing relative ${
                                                    isChecked ? 'border-indigo-400 ring-1 ring-indigo-300' : 'border-gray-200'
                                                }`}
                                            >
                                                {/* Card Header: Checkbox + Name + Menu Button */}
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="flex items-start gap-2 min-w-0 flex-1">
                                                        <input
                                                            type="checkbox"
                                                            checked={isChecked}
                                                            onChange={() => toggleSelect(app.id)}
                                                            className="mt-0.5 h-3.5 w-3.5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 cursor-pointer shrink-0"
                                                        />
                                                        <div className="min-w-0 flex-1">
                                                            <div className="font-bold text-xs text-gray-900 leading-tight truncate" title={app.student_name}>
                                                                {app.student_name}
                                                            </div>
                                                            <div className="text-[11px] text-gray-500 truncate" title={app.email}>
                                                                {app.email}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Accessible Move / Action Menu */}
                                                    <div className="relative shrink-0">
                                                        <button
                                                            type="button"
                                                            onClick={() => setOpenMoveMenuId(isMenuOpen ? null : app.id)}
                                                            className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                                                            aria-label="Actions for candidate"
                                                        >
                                                            <MoreVertical className="w-3.5 h-3.5" />
                                                        </button>

                                                        {/* Move Dropdown Menu */}
                                                        {isMenuOpen && (
                                                            <div className="absolute right-0 top-6 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-30 text-xs">
                                                                <div className="px-3 py-1 font-semibold text-gray-400 text-[10px] uppercase">
                                                                    Move to Stage
                                                                </div>
                                                                {stages.map(s => (
                                                                    <button
                                                                        key={s.id}
                                                                        disabled={s.id === stage.id}
                                                                        onClick={() => handleMoveStage(app.id, s.id)}
                                                                        className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-indigo-50 hover:text-indigo-600 ${
                                                                            s.id === stage.id ? 'opacity-40 cursor-default' : ''
                                                                        }`}
                                                                    >
                                                                        <span>{s.name}</span>
                                                                        {s.id === stage.id && <span className="text-[10px] text-gray-400">(current)</span>}
                                                                    </button>
                                                                ))}

                                                                <div className="border-t border-gray-100 my-1"></div>
                                                                <div className="px-3 py-1 font-semibold text-gray-400 text-[10px] uppercase">
                                                                    Set Outcome
                                                                </div>
                                                                <button
                                                                    onClick={() => handleMoveStage(app.id, null, 'Advanced')}
                                                                    className="w-full text-left px-3 py-1.5 text-blue-600 hover:bg-blue-50"
                                                                >
                                                                    Advance
                                                                </button>
                                                                {isLastStage && (
                                                                    <button
                                                                        onClick={() => handleMoveStage(app.id, null, 'Selected')}
                                                                        className="w-full text-left px-3 py-1.5 text-emerald-600 hover:bg-emerald-50 font-semibold"
                                                                    >
                                                                        Mark Selected
                                                                    </button>
                                                                )}
                                                                <button
                                                                    onClick={() => {
                                                                        setOpenMoveMenuId(null);
                                                                        setActionModal({
                                                                            isOpen: true,
                                                                            isBulk: false,
                                                                            appId: app.id,
                                                                            targetOutcome: 'Waitlisted',
                                                                            reasonCode: 'seat_limit',
                                                                            feedback: ''
                                                                        });
                                                                    }}
                                                                    className="w-full text-left px-3 py-1.5 text-purple-600 hover:bg-purple-50"
                                                                >
                                                                    Waitlist...
                                                                </button>
                                                                <button
                                                                    onClick={() => {
                                                                        setOpenMoveMenuId(null);
                                                                        setActionModal({
                                                                            isOpen: true,
                                                                            isBulk: false,
                                                                            appId: app.id,
                                                                            targetOutcome: 'Rejected',
                                                                            reasonCode: 'skill_mismatch',
                                                                            feedback: ''
                                                                        });
                                                                    }}
                                                                    className="w-full text-left px-3 py-1.5 text-rose-600 hover:bg-rose-50"
                                                                >
                                                                    Reject...
                                                                </button>

                                                                <div className="border-t border-gray-100 my-1"></div>
                                                                <button
                                                                    onClick={() => {
                                                                        setOpenMoveMenuId(null);
                                                                        setActiveCollabAppId(app.id);
                                                                    }}
                                                                    className="w-full text-left px-3 py-1.5 text-indigo-600 hover:bg-indigo-50 flex items-center gap-1.5 font-medium"
                                                                >
                                                                    <MessageSquare className="w-3.5 h-3.5" /> Scorecards & Collab
                                                                </button>

                                                                {onViewProfile && (
                                                                    <button
                                                                        onClick={() => {
                                                                            setOpenMoveMenuId(null);
                                                                            onViewProfile(app.id);
                                                                        }}
                                                                        className="w-full text-left px-3 py-1.5 text-gray-700 hover:bg-gray-50 flex items-center gap-1.5"
                                                                    >
                                                                        <User className="w-3.5 h-3.5" /> View Profile
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Dept, Year & Outcome Badge */}
                                                <div className="mt-2 flex items-center justify-between gap-1 flex-wrap">
                                                    <span className="text-[10px] text-gray-500">
                                                        {app.department || 'General'} {app.year ? `• Y${app.year}` : ''}
                                                    </span>
                                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${OUTCOME_BADGES[app.outcome] || 'bg-gray-50 text-gray-600'}`}>
                                                        {app.outcome || 'Pending'}
                                                    </span>
                                                </div>

                                                {/* Assigned Reviewers & Collab trigger */}
                                                <div className="mt-2 flex items-center justify-between gap-1 text-[10px] bg-gray-50/80 p-1.5 rounded border border-gray-100">
                                                    <div className="flex items-center gap-1 overflow-hidden">
                                                        {(appAssignments[app.id] || []).length > 0 ? (
                                                            <span className="truncate max-w-[110px] text-gray-600" title={(appAssignments[app.id] || []).map(a => a.reviewer_name).join(', ')}>
                                                                {(appAssignments[app.id] || []).map(a => a.reviewer_name?.split(' ')[0] || 'User').join(', ')}
                                                            </span>
                                                        ) : (
                                                            <span className="text-amber-600 italic">Unassigned</span>
                                                        )}
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => setActiveCollabAppId(app.id)}
                                                        className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:text-indigo-800"
                                                        title="Open Collaboration, Scorecards, & Discussion"
                                                    >
                                                        <MessageSquare className="w-3 h-3" />
                                                        <span>Collab</span>
                                                    </button>
                                                </div>

                                                {/* If rejected / waitlisted, show reason badge */}
                                                {app.rejection_reason_code && (
                                                    <div className="mt-1.5 text-[10px] text-gray-500 bg-gray-50 px-2 py-1 rounded border border-gray-100">
                                                        <span className="font-semibold text-gray-700">Reason:</span> {REASON_LABELS[app.rejection_reason_code] || app.rejection_reason_code}
                                                    </div>
                                                )}

                                                {/* Motivation snippet if present */}
                                                {app.motivation && (
                                                    <p className="mt-2 text-[11px] text-gray-600 line-clamp-2 italic">
                                                        "{app.motivation}"
                                                    </p>
                                                )}

                                                {/* Quick advance / move button at bottom of card */}
                                                <div className="mt-2.5 pt-2 border-t border-gray-100 flex items-center justify-between text-[11px]">
                                                    {sIdx < stages.length - 1 ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleMoveStage(app.id, stages[sIdx + 1].id)}
                                                            className="text-indigo-600 hover:text-indigo-800 font-semibold inline-flex items-center gap-1"
                                                        >
                                                            Advance <ArrowRight className="w-3 h-3" />
                                                        </button>
                                                    ) : (
                                                        <span className="text-gray-400 text-[10px]">Final Stage</span>
                                                    )}
                                                    {onViewProfile && (
                                                        <button
                                                            type="button"
                                                            onClick={() => onViewProfile(app.id)}
                                                            className="text-gray-500 hover:text-gray-800 text-[10px]"
                                                        >
                                                            Review
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Rejection / Waitlist Reason Modal */}
            {actionModal.isOpen && (
                <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6 shadow-xl border border-gray-100 space-y-4 animate-in fade-in zoom-in-95 duration-150">
                        <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                            <h3 className="text-base font-bold text-gray-900">
                                {actionModal.targetOutcome === 'Rejected' ? 'Reject Applicant' : 'Waitlist Applicant'}
                                {actionModal.isBulk && ` (${selectedIds.size} selected)`}
                            </h3>
                            <button
                                onClick={() => setActionModal(prev => ({ ...prev, isOpen: false }))}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleModalSubmit} className="space-y-3.5 text-xs">
                            <div>
                                <label className="block font-semibold text-gray-700 mb-1">
                                    Reason Code <span className="text-red-500">*</span>
                                </label>
                                <select
                                    value={actionModal.reasonCode}
                                    onChange={e => setActionModal(prev => ({ ...prev, reasonCode: e.target.value }))}
                                    className="w-full py-2 px-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-xs"
                                    required
                                >
                                    {REASON_CODES.map(code => (
                                        <option key={code} value={code}>
                                            {REASON_LABELS[code]}
                                        </option>
                                    ))}
                                </select>
                                <p className="text-[10px] text-gray-500 mt-0.5">
                                    Reason codes feed analytics and student appeals.
                                </p>
                            </div>

                            <div>
                                <label className="block font-semibold text-gray-700 mb-1">
                                    Student Feedback (Optional)
                                </label>
                                <textarea
                                    value={actionModal.feedback}
                                    onChange={e => setActionModal(prev => ({ ...prev, feedback: e.target.value }))}
                                    rows={3}
                                    placeholder="Provide constructive feedback visible to the student..."
                                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-xs"
                                />
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                                <button
                                    type="button"
                                    onClick={() => setActionModal(prev => ({ ...prev, isOpen: false }))}
                                    className="px-3.5 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={actionLoading}
                                    className={`px-4 py-1.5 rounded-lg text-white font-semibold transition ${
                                        actionModal.targetOutcome === 'Rejected'
                                            ? 'bg-rose-600 hover:bg-rose-700'
                                            : 'bg-purple-600 hover:bg-purple-700'
                                    }`}
                                >
                                    {actionLoading ? 'Saving...' : 'Confirm Decision'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Application Collaboration Modal (Comments, Scorecards, Reviewers, Timeline, Heartbeat) */}
            {activeCollabAppId && (
                <ApplicationCollaborationModal
                    applicationId={activeCollabAppId}
                    drive={drive}
                    clubMembers={clubMembers}
                    onClose={() => setActiveCollabAppId(null)}
                    onApplicationUpdated={() => {
                        if (onRefresh) onRefresh();
                    }}
                />
            )}
        </div>
    );
};

export default KanbanBoard;

