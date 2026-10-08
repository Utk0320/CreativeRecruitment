import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Briefcase, Calendar, CheckCircle } from 'lucide-react';

const StudentApplyHub = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [drives, setDrives] = useState([]);
    const [applications, setApplications] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [drivesRes, appsRes] = await Promise.all([
                    axios.get('http://localhost:5000/api/drives'),
                    axios.get('http://localhost:5000/api/applications')
                ]);
                
                // Only show open drives
                setDrives(drivesRes.data.filter(d => d.status === 'open'));
                setApplications(appsRes.data);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="bg-gray-50 min-h-screen py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto">
                <div className="mb-10">
                    <h1 className="text-3xl font-extrabold text-gray-900">Apply to Clubs</h1>
                    <p className="mt-2 text-lg text-gray-600">Browse active recruitment drives and submit your applications.</p>
                </div>

                {drives.length === 0 ? (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
                        <Briefcase className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                        <h3 className="text-xl font-bold text-gray-900 mb-2">No Active Drives</h3>
                        <p className="text-gray-500">There are currently no active recruitment drives. Please check back later.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {drives.map(drive => {
                            const hasApplied = applications.some(app => app.drive_id === drive.id);
                            
                            return (
                                <div key={drive.id} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow flex flex-col">
                                    <div className="p-6 flex-1">
                                        <div className="flex justify-between items-start mb-4">
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                Active
                                            </span>
                                            <span className="flex items-center text-xs text-gray-500">
                                                <Calendar className="w-3 h-3 mr-1" />
                                                Due {new Date(drive.deadline).toLocaleDateString()}
                                            </span>
                                        </div>
                                        <h3 className="text-xl font-bold text-gray-900 mb-1">{drive.club_name}</h3>
                                        <h4 className="text-md font-medium text-indigo-600 mb-3">{drive.title}</h4>
                                        <p className="text-sm text-gray-600 line-clamp-3 mb-4">
                                            {drive.description}
                                        </p>
                                        
                                        <div className="mb-2">
                                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Eligibility</p>
                                            <p className="text-sm text-gray-800">{drive.eligibility}</p>
                                        </div>
                                    </div>
                                    <div className="p-6 bg-gray-50 border-t border-gray-100">
                                        {hasApplied ? (
                                            <button 
                                                disabled
                                                className="w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-gray-500 bg-gray-200 cursor-not-allowed"
                                            >
                                                <CheckCircle className="w-4 h-4 mr-2" />
                                                Applied
                                            </button>
                                        ) : (
                                            <Link 
                                                to={`/student/apply/${drive.id}`}
                                                className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
                                            >
                                                Apply Now
                                            </Link>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default StudentApplyHub;

