import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { ArrowLeft, Camera, Edit2, Link as LinkIcon, Plus, X, Book, Award, Briefcase, Code } from 'lucide-react';
import { Link } from 'react-router-dom';

const StudentProfile = () => {
    const { user, setUser } = useAuth();
    const [isEditing, setIsEditing] = useState(false);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    
    const [formData, setFormData] = useState({
        name: '', department: '', year: '', bio: '',
        skills: [], interests: [], projects: [], achievements: []
    });

    const [newSkill, setNewSkill] = useState('');
    const [newInterest, setNewInterest] = useState('');
    const [newAchievement, setNewAchievement] = useState('');
    const [newProject, setNewProject] = useState({ name: '', description: '', technologies: '', link: '' });

    useEffect(() => {
        if (user) {
            setFormData({
                name: user.name || '',
                department: user.department || '',
                year: user.year || '',
                bio: user.bio || '',
                skills: parseJsonSafe(user.skills, []),
                interests: parseJsonSafe(user.interests, []),
                projects: parseJsonSafe(user.projects, []),
                achievements: parseJsonSafe(user.achievements, [])
            });
        }
    }, [user, isEditing]);

    const parseJsonSafe = (str, fallback) => {
        if (!str) return fallback;
        if (typeof str === 'object') return str;
        try { return JSON.parse(str); } catch(e) { return fallback; }
    };

    const handleSave = async () => {
        if (!formData.name.trim() || !formData.department.trim() || !formData.year || formData.year < 1 || formData.year > 4) {
            alert('Enter your name, department, and a valid year of study.');
            return;
        }
        setLoading(true);
        try {
            await axios.put(`http://localhost:5000/api/users/${user.id}`, {
                ...formData,
                name: formData.name.trim(),
                department: formData.department.trim(),
                skills: JSON.stringify(formData.skills),
                interests: JSON.stringify(formData.interests),
                projects: JSON.stringify(formData.projects),
                achievements: JSON.stringify(formData.achievements)
            });
            setUser({ ...user, ...formData,
                name: formData.name.trim(),
                department: formData.department.trim(),
                skills: JSON.stringify(formData.skills),
                interests: JSON.stringify(formData.interests),
                projects: JSON.stringify(formData.projects),
                achievements: JSON.stringify(formData.achievements)
            });
            setIsEditing(false);
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to save profile');
        }
        setLoading(false);
    };

    const handleAvatarUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/') || file.size > 2 * 1024 * 1024) {
            alert('Choose an image smaller than 2 MB.');
            e.target.value = '';
            return;
        }
        const form = new FormData();
        form.append('avatar', file);

        setUploading(true);
        try {
            const res = await axios.post(`http://localhost:5000/api/users/${user.id}/avatar`, form, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setUser({ ...user, profile_picture_url: res.data.url });
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to upload picture');
        }
        setUploading(false);
        e.target.value = '';
    };

    const addArrayItem = (field, value, setter) => {
        if (!value.trim()) return;
        setFormData(prev => ({ ...prev, [field]: [...prev[field], value.trim()] }));
        setter('');
    };

    const removeArrayItem = (field, index) => {
        setFormData(prev => ({ ...prev, [field]: prev[field].filter((_, i) => i !== index) }));
    };

    const addProject = () => {
        if (!newProject.name.trim()) return;
        setFormData(prev => ({ ...prev, projects: [...prev.projects, newProject] }));
        setNewProject({ name: '', description: '', technologies: '', link: '' });
    };

    const calculateCompletion = () => {
        let score = 0;
        if (user.profile_picture_url) score += 15;
        if (user.bio) score += 15;
        if (user.department && user.year) score += 10;
        if (parseJsonSafe(user.skills, []).length > 0) score += 15;
        if (parseJsonSafe(user.interests, []).length > 0) score += 15;
        if (parseJsonSafe(user.projects, []).length > 0) score += 15;
        if (parseJsonSafe(user.achievements, []).length > 0) score += 15;
        return Math.min(score, 100);
    };

    return (
        <div className="bg-gray-50 min-h-screen py-8 px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto">
                <Link to="/student/dashboard" className="inline-flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-800 mb-6">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
                </Link>

                {/* Profile Header Card */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mb-6 relative">
                    <div className="h-32 bg-gradient-to-r from-indigo-500 to-purple-600"></div>
                    
                    <div className="px-8 pb-8">
                        <div className="flex justify-between items-start">
                            <div className="relative -mt-16 mb-4">
                                {user.profile_picture_url ? (
                                    <img src={`http://localhost:5000${user.profile_picture_url}`} alt={user.name} className="w-32 h-32 rounded-full border-4 border-white object-cover bg-white" />
                                ) : (
                                    <div className="w-32 h-32 rounded-full border-4 border-white bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-4xl">
                                        {user.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                                    </div>
                                )}
                                {isEditing && (
                                    <label className="absolute bottom-0 right-0 p-2 bg-indigo-600 text-white rounded-full cursor-pointer hover:bg-indigo-700 shadow-md">
                                        <Camera className="w-5 h-5" />
                                        <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} disabled={uploading} />
                                    </label>
                                )}
                            </div>
                            
                            <div className="mt-4">
                                {!isEditing ? (
                                    <button onClick={() => setIsEditing(true)} className="flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
                                        <Edit2 className="w-4 h-4 mr-2" /> Edit Profile
                                    </button>
                                ) : (
                                    <div className="flex space-x-2">
                                        <button onClick={() => setIsEditing(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
                                        <button onClick={handleSave} disabled={loading} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700 shadow-sm">
                                            {loading ? 'Saving...' : 'Save Profile'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {!isEditing ? (
                            <div>
                                <h1 className="text-3xl font-bold text-gray-900">{user.name}</h1>
                                <p className="text-lg text-gray-600 mt-1">
                                    {user.department || 'Department not set'} • {user.year ? `${user.year}${user.year == 1 ? 'st' : user.year == 2 ? 'nd' : user.year == 3 ? 'rd' : 'th'} Year` : 'Year not set'}
                                </p>
                                <p className="text-sm text-gray-500 mt-1">MMCOE, Pune</p>
                                
                                <div className="mt-4 text-gray-700 max-w-2xl">
                                    {user.bio ? <p>{user.bio}</p> : <p className="text-gray-400 italic">No bio added yet.</p>}
                                </div>
                                
                              </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                <div><label className="block text-sm font-medium text-gray-700 mb-1">Name</label><input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-3 py-2 border rounded-md" /></div>
                                <div><label className="block text-sm font-medium text-gray-700 mb-1">Department</label><input type="text" value={formData.department} onChange={e => setFormData({...formData, department: e.target.value})} placeholder="e.g. Computer Engineering" className="w-full px-3 py-2 border rounded-md" /></div>
                                <div><label className="block text-sm font-medium text-gray-700 mb-1">Year</label><input type="number" value={formData.year} onChange={e => setFormData({...formData, year: e.target.value})} placeholder="e.g. 2" className="w-full px-3 py-2 border rounded-md" /></div>
                                <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Bio</label><textarea value={formData.bio} onChange={e => setFormData({...formData, bio: e.target.value})} rows="3" className="w-full px-3 py-2 border rounded-md"></textarea></div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Main Content Area */}
                    <div className="md:col-span-2 space-y-6">
                        
                        {/* Projects Section */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center"><Briefcase className="w-5 h-5 mr-2 text-indigo-600"/> Projects</h2>
                            
                            {!isEditing ? (
                                parseJsonSafe(user.projects, []).length === 0 ? (
                                    <div className="text-center py-6"><Book className="w-10 h-10 text-gray-300 mx-auto mb-2" /><p className="text-gray-500 text-sm">Add your projects to showcase your practical experience.</p></div>
                                ) : (
                                    <div className="space-y-4">
                                        {parseJsonSafe(user.projects, []).map((proj, idx) => (
                                            <div key={idx} className="border border-gray-100 rounded-lg p-4 hover:border-indigo-100 transition-colors">
                                                <div className="flex justify-between">
                                                    <h3 className="font-bold text-gray-900">{proj.name}</h3>
                                                    {proj.link && <a href={proj.link} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-800"><LinkIcon className="w-4 h-4"/></a>}
                                                </div>
                                                <p className="text-sm text-indigo-600 font-medium mb-2">{proj.technologies}</p>
                                                <p className="text-sm text-gray-600">{proj.description}</p>
                                            </div>
                                        ))}
                                    </div>
                                )
                            ) : (
                                <div className="space-y-4">
                                    {formData.projects.map((proj, idx) => (
                                        <div key={idx} className="border border-gray-200 rounded-lg p-4 relative">
                                            <button onClick={() => removeArrayItem('projects', idx)} className="absolute top-2 right-2 text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button>
                                            <h4 className="font-bold">{proj.name}</h4><p className="text-sm text-gray-500">{proj.technologies}</p>
                                        </div>
                                    ))}
                                    <div className="border border-dashed border-gray-300 rounded-lg p-4 bg-gray-50">
                                        <input type="text" placeholder="Project Name" value={newProject.name} onChange={e => setNewProject({...newProject, name: e.target.value})} className="w-full px-3 py-2 mb-2 border rounded-md text-sm" />
                                        <input type="text" placeholder="Technologies (e.g. React, Node.js)" value={newProject.technologies} onChange={e => setNewProject({...newProject, technologies: e.target.value})} className="w-full px-3 py-2 mb-2 border rounded-md text-sm" />
                                        <textarea placeholder="Description" rows="2" value={newProject.description} onChange={e => setNewProject({...newProject, description: e.target.value})} className="w-full px-3 py-2 mb-2 border rounded-md text-sm" />
                                        <input type="url" placeholder="Project Link (optional)" value={newProject.link} onChange={e => setNewProject({...newProject, link: e.target.value})} className="w-full px-3 py-2 mb-2 border rounded-md text-sm" />
                                        <button onClick={addProject} className="flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-800"><Plus className="w-4 h-4 mr-1" /> Add Project</button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Achievements Section */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center"><Award className="w-5 h-5 mr-2 text-indigo-600"/> Achievements & Activities</h2>
                            
                            {!isEditing ? (
                                parseJsonSafe(user.achievements, []).length === 0 ? (
                                    <p className="text-gray-500 text-sm italic">Add competitions, certifications or college achievements.</p>
                                ) : (
                                    <ul className="list-disc list-inside space-y-2 text-gray-700">
                                        {parseJsonSafe(user.achievements, []).map((ach, idx) => <li key={idx}>{ach}</li>)}
                                    </ul>
                                )
                            ) : (
                                <div>
                                    <ul className="space-y-2 mb-3">
                                        {formData.achievements.map((ach, idx) => (
                                            <li key={idx} className="flex justify-between items-center bg-gray-50 px-3 py-2 rounded-md">
                                                <span className="text-sm">{ach}</span>
                                                <button onClick={() => removeArrayItem('achievements', idx)} className="text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button>
                                            </li>
                                        ))}
                                    </ul>
                                    <div className="flex">
                                        <input type="text" value={newAchievement} onChange={e => setNewAchievement(e.target.value)} onKeyPress={e => e.key === 'Enter' && addArrayItem('achievements', newAchievement, setNewAchievement)} placeholder="Add achievement..." className="flex-1 px-3 py-2 border rounded-l-md text-sm" />
                                        <button onClick={() => addArrayItem('achievements', newAchievement, setNewAchievement)} className="bg-indigo-50 px-3 border border-l-0 border-gray-300 rounded-r-md text-indigo-600"><Plus className="w-4 h-4" /></button>
                                    </div>
                                </div>
                            )}
                        </div>

                    </div>

                    {/* Sidebar Area */}
                    <div className="space-y-6">
                        
                        {/* Profile Completion */}
                        {!isEditing && (
                            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                                <h3 className="font-bold text-gray-900 mb-2">Profile Strength</h3>
                                <div className="flex justify-between text-sm mb-2"><span className="text-gray-500">Completion</span><span className="font-bold text-indigo-600">{calculateCompletion()}%</span></div>
                                <div className="w-full bg-gray-100 rounded-full h-2"><div className="bg-indigo-600 h-2 rounded-full" style={{width: `${calculateCompletion()}%`}}></div></div>
                            </div>
                        )}

                        {/* Skills */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                            <h3 className="font-bold text-gray-900 mb-4">Skills</h3>
                            {!isEditing ? (
                                <div className="flex flex-wrap gap-2">
                                    {parseJsonSafe(user.skills, []).length === 0 ? <p className="text-gray-500 text-sm italic">No skills added.</p> : parseJsonSafe(user.skills, []).map((skill, idx) => (
                                        <span key={idx} className="bg-gray-100 text-gray-800 px-3 py-1 rounded-full text-sm font-medium">{skill}</span>
                                    ))}
                                </div>
                            ) : (
                                <div>
                                    <div className="flex flex-wrap gap-2 mb-3">
                                        {formData.skills.map((skill, idx) => (
                                            <span key={idx} className="bg-gray-100 text-gray-800 px-3 py-1 rounded-full text-sm font-medium flex items-center">
                                                {skill} <button onClick={() => removeArrayItem('skills', idx)} className="ml-1 text-gray-500 hover:text-red-500"><X className="w-3 h-3" /></button>
                                            </span>
                                        ))}
                                    </div>
                                    <div className="flex">
                                        <input type="text" value={newSkill} onChange={e => setNewSkill(e.target.value)} onKeyPress={e => e.key === 'Enter' && addArrayItem('skills', newSkill, setNewSkill)} placeholder="Add skill..." className="flex-1 px-3 py-2 border rounded-l-md text-sm" />
                                        <button onClick={() => addArrayItem('skills', newSkill, setNewSkill)} className="bg-indigo-50 px-3 border border-l-0 border-gray-300 rounded-r-md text-indigo-600"><Plus className="w-4 h-4" /></button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Interests */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                            <h3 className="font-bold text-gray-900 mb-4">Interests</h3>
                            {!isEditing ? (
                                <div className="flex flex-wrap gap-2">
                                    {parseJsonSafe(user.interests, []).length === 0 ? <p className="text-gray-500 text-sm italic">No interests added.</p> : parseJsonSafe(user.interests, []).map((interest, idx) => (
                                        <span key={idx} className="bg-indigo-50 text-indigo-700 border border-indigo-100 px-3 py-1 rounded-full text-sm font-medium">{interest}</span>
                                    ))}
                                </div>
                            ) : (
                                <div>
                                    <div className="flex flex-wrap gap-2 mb-3">
                                        {formData.interests.map((interest, idx) => (
                                            <span key={idx} className="bg-indigo-50 text-indigo-700 border border-indigo-100 px-3 py-1 rounded-full text-sm font-medium flex items-center">
                                                {interest} <button onClick={() => removeArrayItem('interests', idx)} className="ml-1 text-indigo-400 hover:text-indigo-800"><X className="w-3 h-3" /></button>
                                            </span>
                                        ))}
                                    </div>
                                    <div className="flex">
                                        <input type="text" value={newInterest} onChange={e => setNewInterest(e.target.value)} onKeyPress={e => e.key === 'Enter' && addArrayItem('interests', newInterest, setNewInterest)} placeholder="Add interest..." className="flex-1 px-3 py-2 border rounded-l-md text-sm" />
                                        <button onClick={() => addArrayItem('interests', newInterest, setNewInterest)} className="bg-indigo-50 px-3 border border-l-0 border-gray-300 rounded-r-md text-indigo-600"><Plus className="w-4 h-4" /></button>
                                    </div>
                                </div>
                            )}
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
};

export default StudentProfile;

