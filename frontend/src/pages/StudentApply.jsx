import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, Send } from 'lucide-react';
import { notifyDataChanged } from '../hooks/useDataSync';

const StudentApply = () => {
    const { driveId } = useParams();
    const navigate = useNavigate();
    const [drive, setDrive] = useState(null);
    const [formData, setFormData] = useState({
        portfolio_url: '',
        answers: ''
    });
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        axios.get('http://localhost:5000/api/drives')
            .then(res => {
                const found = res.data.find(d => d.id === parseInt(driveId));
                setDrive(found);
                setLoading(false);
            });
    }, [driveId]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await axios.post('http://localhost:5000/api/applications', {
                drive_id: driveId,
                portfolio_url: formData.portfolio_url,
                answers: formData.answers
            });
            notifyDataChanged();
            alert('Application submitted successfully!');
            navigate('/student/dashboard');
        } catch (err) {
            alert(err.response?.data?.error || 'Error submitting application');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full"></div></div>;

    return (
        <div className="bg-gray-50 min-h-screen py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto">
                <Link to={`/student/apply`} className="inline-flex items-center text-indigo-600 hover:text-indigo-800 mb-6 font-medium">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back to Apply Hub
                </Link>
                
                <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
                    <div className="bg-indigo-600 p-8 text-white">
                        <h1 className="text-3xl font-bold mb-2">Apply for {drive.title}</h1>
                        <p className="text-indigo-100">{drive.club_name}</p>
                    </div>
                    
                    <div className="p-8">
                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Portfolio / Resume URL</label>
                                <input
                                    type="url"
                                    required
                                    placeholder="https://your-portfolio.com or Drive link"
                                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                    value={formData.portfolio_url}
                                    onChange={e => setFormData({...formData, portfolio_url: e.target.value})}
                                />
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Why do you want to join? (Motivation & Skills)</label>
                                <textarea
                                    required
                                    rows="5"
                                    placeholder="Tell us about your relevant skills, experience, and why you'd be a great fit..."
                                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                    value={formData.answers}
                                    onChange={e => setFormData({...formData, answers: e.target.value})}
                                ></textarea>
                            </div>
                            
                            <div className="pt-4">
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="w-full flex items-center justify-center py-4 px-4 border border-transparent rounded-xl shadow-sm text-lg font-bold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors disabled:opacity-70"
                                >
                                    {submitting ? 'Submitting...' : 'Submit Application'}
                                    {!submitting && <Send className="ml-2 w-5 h-5" />}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StudentApply;
