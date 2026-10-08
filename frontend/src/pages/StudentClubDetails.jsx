import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { Users, Calendar, ArrowLeft, Briefcase, MapPin, Globe } from 'lucide-react';

const StudentClubDetails = () => {
    const { id } = useParams();
    const [club, setClub] = useState(null);
    const [drives, setDrives] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDetails = async () => {
            try {
                const [clubRes, drivesRes] = await Promise.all([
                    axios.get(`http://localhost:5000/api/clubs/${id}`),
                    axios.get('http://localhost:5000/api/drives')
                ]);
                setClub(clubRes.data);
                setDrives(drivesRes.data.filter(d => d.club_id === parseInt(id) && d.status === 'open'));
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchDetails();
    }, [id]);

    if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full"></div></div>;
    if (!club) return <div className="p-8 text-center text-red-500 font-bold text-xl">Club not found</div>;

    return (
        <div className="bg-gray-50 min-h-screen pb-12">
            {/* Header Banner */}
            <div className="h-64 bg-gradient-to-r from-indigo-700 to-purple-800 relative">
                <Link to="/explore-clubs" className="absolute top-6 left-6 inline-flex items-center text-white/80 hover:text-white transition-colors bg-black/20 hover:bg-black/40 px-3 py-1.5 rounded-full text-sm font-medium backdrop-blur-sm">
                    <ArrowLeft className="w-4 h-4 mr-1" /> Back to Clubs
                </Link>
            </div>

            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 -mt-24 relative z-10">
                <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden mb-8">
                    <div className="p-8 sm:p-10 flex flex-col sm:flex-row gap-8 items-start sm:items-center">
                        <div className="w-32 h-32 bg-white rounded-3xl shadow-lg border-4 border-white flex-shrink-0 flex items-center justify-center -mt-16 sm:-mt-0">
                            <Users className="w-16 h-16 text-indigo-500" />
                        </div>
                        <div className="flex-1">
                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
                                <div>
                                    <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-2">{club.name}</h1>
                                    <div className="flex flex-wrap gap-3 text-sm text-gray-600 mb-4">
                                        <span className="inline-flex items-center bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full font-semibold">
                                            {club.category || 'General'}
                                        </span>
                                        <span className="inline-flex items-center"><MapPin className="w-4 h-4 mr-1" /> Campus</span>
                                        <span className="inline-flex items-center"><Globe className="w-4 h-4 mr-1" /> {club.name.toLowerCase().replace(' ', '')}.edu</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="border-t border-gray-100 p-8 sm:p-10 bg-gray-50/50">
                        <h3 className="text-xl font-bold text-gray-900 mb-4">About Us</h3>
                        <p className="text-gray-600 leading-relaxed text-lg">
                            {club.description || 'No description provided.'}
                        </p>
                    </div>
                </div>

                {/* Recruitment Drives */}
                <div>
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-2xl font-bold text-gray-900 flex items-center">
                            <Briefcase className="w-6 h-6 mr-2 text-indigo-600" /> Active Recruitment
                        </h2>
                        <span className="bg-indigo-100 text-indigo-800 text-sm font-bold px-3 py-1 rounded-full">{drives.length} Drives</span>
                    </div>

                    {drives.length === 0 ? (
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
                            <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-medium text-gray-900">No active recruitment drives</h3>
                            <p className="text-gray-500 mt-2">Check back later for opportunities.</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {drives.map(drive => (
                                <div key={drive.id} className="bg-white rounded-2xl shadow-sm hover:shadow-lg transition-shadow border border-gray-100 p-6 sm:p-8">
                                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3 mb-2">
                                                <h3 className="text-2xl font-bold text-gray-900">{drive.title}</h3>
                                                <span className="bg-green-100 text-green-800 text-xs font-bold px-2.5 py-1 rounded-md uppercase tracking-wide">Accepting</span>
                                            </div>
                                            <p className="text-gray-600 mb-6 line-clamp-2">{drive.description}</p>
                                            
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm bg-gray-50 p-4 rounded-xl">
                                                <div>
                                                    <span className="block text-gray-500 font-medium mb-1">Eligibility</span>
                                                    <span className="font-semibold text-gray-900">{drive.eligibility}</span>
                                                </div>
                                                <div>
                                                    <span className="block text-gray-500 font-medium mb-1">Deadline</span>
                                                    <span className="font-semibold text-red-600 flex items-center">
                                                        <Calendar className="w-4 h-4 mr-1" /> {new Date(drive.deadline).toLocaleDateString()}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center md:items-end justify-center">
                                            <Link to={`/student/apply/${drive.id}`} className="w-full md:w-auto px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow transition-colors text-center">
                                                Apply Now
                                            </Link>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default StudentClubDetails;
