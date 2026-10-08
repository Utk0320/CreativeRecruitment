import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, Briefcase, Calendar } from 'lucide-react';

const StudentApplications = () => {
    const { user } = useAuth();
    const [applications, setApplications] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchApplications = async () => {
            try {
                const res = await axios.get('http://localhost:5000/api/applications');
                // Sort by applied_at descending
                const sortedApps = res.data.sort((a, b) => new Date(b.applied_at) - new Date(a.applied_at));
                setApplications(sortedApps);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchApplications();
    }, []);

    const getStatusColor = (status) => {
        switch(status) {
            case 'Selected': return 'bg-green-100 text-green-800 border-green-200';
            case 'Rejected': return 'bg-red-100 text-red-800 border-red-200';
            case 'Shortlisted': return 'bg-purple-100 text-purple-800 border-purple-200';
            case 'Under Review': return 'bg-blue-100 text-blue-800 border-blue-200';
            default: return 'bg-gray-100 text-gray-800 border-gray-200';
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="bg-gray-50 min-h-screen py-8 px-4 sm:px-6 lg:px-8">
            <div className="max-w-5xl mx-auto">
                <Link to="/student/dashboard" className="inline-flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-800 mb-6">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
                </Link>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="p-6 border-b border-gray-100 bg-white">
                        <h1 className="text-2xl font-bold text-gray-900">All Applications</h1>
                        <p className="text-gray-500 mt-1">Review the status of your club applications</p>
                    </div>
                    
                    <div className="divide-y divide-gray-100">
                        {applications.length === 0 ? (
                            <div className="p-16 text-center">
                                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
                                    <Briefcase className="w-8 h-8 text-gray-400" />
                                </div>
                                <h3 className="text-lg font-medium text-gray-900 mb-1">No applications yet</h3>
                                <p className="text-gray-500 mb-6">You haven't applied to any clubs yet.</p>
                                <Link to="/student/apply" className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700">
                                    Find Clubs to Apply
                                </Link>
                            </div>
                        ) : (
                            applications.map(app => (
                                <div key={app.id} className="p-6 hover:bg-gray-50 transition-colors">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between">
                                        <div className="mb-4 sm:mb-0">
                                            <h3 className="text-lg font-bold text-gray-900">{app.club_name}</h3>
                                            <p className="text-sm font-medium text-indigo-600 mb-1">{app.drive_title}</p>
                                            <div className="flex items-center text-xs text-gray-500 mt-2">
                                                <Calendar className="w-3.5 h-3.5 mr-1" />
                                                Applied on {new Date(app.applied_at).toLocaleDateString()}
                                                {app.updated_at && app.updated_at !== app.applied_at && (
                                                    <span className="ml-3 italic">
                                                        (Updated: {new Date(app.updated_at).toLocaleDateString()})
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex flex-col sm:items-end">
                                            <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(app.status)} mb-2`}>
                                                {app.status}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StudentApplications;

