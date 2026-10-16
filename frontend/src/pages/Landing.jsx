import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Compass, Users, Calendar, Award, ArrowRight, CheckCircle } from 'lucide-react';

const Landing = () => {
    const { user } = useAuth();
    const dashPath = user?.role === 'coordinator' ? '/coordinator/dashboard' : '/student/dashboard';
    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-900">


            {/* Hero Section */}
            <section className="relative px-6 py-20 lg:px-8 overflow-hidden bg-white">
                <div className="absolute inset-0 bg-indigo-50/50 [mask-image:linear-gradient(to_bottom,white,transparent)]"></div>
                <div className="mx-auto max-w-5xl relative z-10 text-center pt-10 pb-16">
                    <div className="inline-flex items-center rounded-full px-3 py-1 text-sm font-medium text-indigo-600 bg-indigo-100 ring-1 ring-inset ring-indigo-600/20 mb-8 animate-fade-in-up">
                        The ultimate college club platform
                    </div>
                    <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-slate-900 mb-6 leading-tight">
                        Find Your Club.<br/>
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">Find Your People.</span>
                    </h1>
                    <p className="mt-6 text-xl leading-8 text-slate-600 max-w-2xl mx-auto mb-10">
                        Discover college clubs, explore recruitment opportunities, and take the next step toward something you love.
                    </p>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                        <Link
                            to="/explore-clubs"
                            className="w-full sm:w-auto rounded-full bg-indigo-600 px-8 py-4 text-base font-semibold text-white shadow-sm hover:bg-indigo-500 transition-all hover:scale-105 inline-flex items-center justify-center"
                        >
                            Explore Clubs <ArrowRight className="ml-2 w-5 h-5" />
                        </Link>
                        {user ? (
                            <Link to={dashPath} className="w-full sm:w-auto rounded-full bg-white px-8 py-4 text-base font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-200 hover:bg-indigo-50 transition-all text-center">
                                Go to Dashboard
                            </Link>
                        ) : (
                            <Link to="/register" className="w-full sm:w-auto rounded-full bg-white px-8 py-4 text-base font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-200 hover:bg-indigo-50 transition-all text-center">
                                Create Free Account
                            </Link>
                        )}
                    </div>
                </div>
            </section>

            {/* How It Works Section */}
            <section className="py-24 bg-slate-50">
                <div className="mx-auto max-w-7xl px-6 lg:px-8">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">How It Works</h2>
                        <p className="mt-4 text-lg text-slate-600">Your journey to finding the perfect club in three simple steps.</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <div className="bg-white rounded-3xl p-8 shadow-sm ring-1 ring-slate-200 hover:shadow-md transition-shadow">
                            <div className="h-12 w-12 bg-indigo-100 rounded-2xl flex items-center justify-center mb-6 text-indigo-600">
                                <Compass size={24} />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 mb-3">1. Discover</h3>
                            <p className="text-slate-600">Browse through various college clubs, filter by category, and find the ones that match your interests and goals.</p>
                        </div>
                        <div className="bg-white rounded-3xl p-8 shadow-sm ring-1 ring-slate-200 hover:shadow-md transition-shadow">
                            <div className="h-12 w-12 bg-purple-100 rounded-2xl flex items-center justify-center mb-6 text-purple-600">
                                <Calendar size={24} />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 mb-3">2. Track Drives</h3>
                            <p className="text-slate-600">Stay updated on active recruitment drives, eligibility criteria, and important application deadlines.</p>
                        </div>
                        <div className="bg-white rounded-3xl p-8 shadow-sm ring-1 ring-slate-200 hover:shadow-md transition-shadow">
                            <div className="h-12 w-12 bg-green-100 rounded-2xl flex items-center justify-center mb-6 text-green-600">
                                <Award size={24} />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 mb-3">3. Apply & Grow</h3>
                            <p className="text-slate-600">Submit your application online, track your status in real-time, and get ready to join the community.</p>
                        </div>
                    </div>
                </div>
            </section>



            {/* Why CreativeRecruit */}
            <section className="py-24 bg-indigo-900 text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 rounded-full bg-indigo-800 opacity-50 blur-3xl"></div>
                <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 rounded-full bg-purple-800 opacity-50 blur-3xl"></div>
                
                <div className="mx-auto max-w-7xl px-6 lg:px-8 relative z-10">
                    <div className="max-w-3xl mx-auto">
                        <div>
                            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-6">Why CreativeRecruit?</h2>
                            <p className="text-indigo-200 text-lg mb-8 leading-relaxed">
                                We built this platform because finding the right club shouldn't rely on posters or word-of-mouth. It should be accessible, organized, and transparent.
                            </p>
                            <ul className="space-y-4">
                                {[
                                    'Centralized hub for all college clubs',
                                    'Clear eligibility and application requirements',
                                    'Real-time status tracking and notifications',
                                    'Simple dashboard for club coordinators'
                                ].map((item, idx) => (
                                    <li key={idx} className="flex items-center">
                                        <CheckCircle className="text-indigo-400 mr-3" size={20} />
                                        <span className="text-indigo-50">{item}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            </section>


        </div>
    );
};

export default Landing;
