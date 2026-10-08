import React, { useEffect, useState } from 'react';
import { Search, AlertCircle, LoaderCircle, ArrowRight } from 'lucide-react';
import axios from 'axios';
import { Link } from 'react-router-dom';

const StudentClubs = () => {
    const [clubs, setClubs] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [category, setCategory] = useState('All');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const categories = ['All', 'Technical', 'Core', 'Extracurricular'];

    useEffect(() => {
        let active = true;
        axios.get('http://localhost:5000/api/clubs')
            .then(res => { if (active) setClubs(res.data); })
            .catch(err => { if (active) setError(err.response?.data?.error || 'Unable to load clubs.'); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, []);

    const filteredClubs = clubs.filter(club => {
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch =
            club.name.toLowerCase().includes(searchLower) ||
            club.description.toLowerCase().includes(searchLower) ||
            (club.category || '').toLowerCase().includes(searchLower);
        const matchesCategory = category === 'All' || club.category === category;
        return matchesSearch && matchesCategory;
    });

    return (
        <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto">
                <div className="text-center mb-12">
                    <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight mb-4">Explore Clubs</h1>
                    <p className="text-lg text-gray-600 max-w-2xl mx-auto">Discover student clubs and communities at MMCOE.</p>
                </div>

                {/* Filters */}
                <div className="mb-10 flex flex-col md:flex-row gap-4 items-center justify-between">
                    <div className="relative w-full md:w-96">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-5 w-5 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            placeholder="Search clubs..."
                            className="block w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-2 w-full md:w-auto no-scrollbar">
                        {categories.map(cat => (
                            <button
                                key={cat}
                                onClick={() => setCategory(cat)}
                                className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium transition-colors ${category === cat ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'}`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                </div>

                {error && (
                    <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
                        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                        <div><p className="font-semibold">Unable to load clubs</p><p className="text-sm">{error}</p></div>
                    </div>
                )}

                {loading ? (
                    <div className="flex min-h-64 items-center justify-center">
                        <LoaderCircle className="h-9 w-9 animate-spin text-indigo-500" />
                    </div>
                ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {filteredClubs.map(club => (
                        <Link key={club.id} to={`/student/clubs/${club.id}`} className="bg-white rounded-2xl shadow-sm hover:shadow-lg transition-all border border-gray-100 group flex flex-col hover:-translate-y-1">
                            <div className="p-6 flex-1 flex flex-col">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-700 font-bold text-lg shadow-sm">
                                        {club.name.substring(0, 2).toUpperCase()}
                                    </div>
                                    <span className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-xs font-semibold tracking-wide border border-indigo-100">
                                        {club.category}
                                    </span>
                                </div>
                                <h3 className="text-xl font-bold text-gray-900 mb-1">{club.name}</h3>
                                <p className="text-gray-600 text-sm mb-4 flex-1 line-clamp-3">
                                    {club.description}
                                </p>
                                <span className="flex items-center justify-between border-t border-gray-100 pt-4 text-sm font-semibold text-indigo-600">
                                    View club <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                                </span>
                            </div>
                        </Link>
                    ))}
                    {filteredClubs.length === 0 && (
                        <div className="col-span-full py-20 text-center">
                            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
                                <Search className="w-8 h-8 text-gray-400" />
                            </div>
                            <h3 className="text-lg font-medium text-gray-900 mb-1">No clubs found</h3>
                            <p className="text-gray-500">Try adjusting your search or category filter.</p>
                        </div>
                    )}
                </div>
                )}
            </div>
        </div>
    );
};

export default StudentClubs;
