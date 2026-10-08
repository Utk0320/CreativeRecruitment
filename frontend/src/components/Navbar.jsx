import React, { useState, useEffect } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogOut, Menu, X } from 'lucide-react';

const studentLinks = [
    { to: '/student/dashboard', label: 'Dashboard' },
    { to: '/explore-clubs', label: 'Explore Clubs' },
    { to: '/student/apply', label: 'Apply' },
    { to: '/student/applications', label: 'My Applications' },
];

const coordinatorLinks = [
    { to: '/coordinator/dashboard', label: 'Dashboard' },
    { to: '/coordinator/clubs', label: 'Clubs' },
    { to: '/coordinator/drives', label: 'Drives' },
];

const guestLinks = [{ to: '/explore-clubs', label: 'Explore Clubs' }];

const Navbar = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [open, setOpen] = useState(false);

    useEffect(() => { setOpen(false); }, [location.pathname]);

    const links = !user ? guestLinks : user.role === 'student' ? studentLinks : coordinatorLinks;
    const profilePath = user?.role === 'student' ? '/student/profile' : null;
    const initials = user ? user.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() : '';

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const linkClass = ({ isActive }) =>
        `inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors ${
            isActive ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
        }`;

    const mobileLinkClass = ({ isActive }) =>
        `block px-3 py-2 rounded-lg text-base font-medium ${
            isActive ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'
        }`;

    return (
        <nav className="bg-white/90 backdrop-blur shadow-sm border-b border-gray-200 sticky top-0 z-40">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between h-16">
                    <div className="flex">
                        <Link to="/" className="flex-shrink-0 flex items-center mr-8">
                            <span className="text-xl sm:text-2xl font-bold text-indigo-600">CreativeRecruit</span>
                        </Link>
                        <div className="hidden md:flex md:space-x-6">
                            {links.map(l => (
                                <NavLink key={l.to} to={l.to} className={linkClass}>{l.label}</NavLink>
                            ))}
                        </div>
                    </div>

                    <div className="hidden md:flex items-center space-x-3">
                        {user ? (
                            <>
                                {profilePath ? (
                                    <Link to={profilePath} className="flex items-center gap-2 group" title="View profile">
                                        <span className="h-8 w-8 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center ring-2 ring-transparent group-hover:ring-indigo-300 transition">{initials}</span>
                                        <span className="text-sm font-medium text-gray-700 max-w-[10rem] truncate">{user.name}</span>
                                    </Link>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <span className="h-8 w-8 rounded-full bg-purple-100 text-purple-700 text-xs font-bold flex items-center justify-center">{initials}</span>
                                        <span className="text-sm font-medium text-gray-700 max-w-[10rem] truncate">{user.name}</span>
                                    </div>
                                )}
                                <span className="px-3 py-1 bg-indigo-100 text-indigo-800 text-xs font-semibold rounded-full border border-indigo-200 capitalize">
                                    {user.role}
                                </span>
                                <button onClick={handleLogout} className="text-gray-500 hover:text-red-600 p-2 transition-colors" title="Logout" aria-label="Logout">
                                    <LogOut size={20} />
                                </button>
                            </>
                        ) : (
                            <>
                                <Link to="/login" className="text-gray-600 hover:text-indigo-600 px-3 py-2 rounded-md text-sm font-medium transition-colors">Login</Link>
                                <Link to="/register" className="bg-indigo-600 text-white hover:bg-indigo-700 px-4 py-2 rounded-md text-sm font-medium transition-colors shadow-sm">Register</Link>
                            </>
                        )}
                    </div>

                    <div className="flex items-center md:hidden">
                        <button
                            onClick={() => setOpen(o => !o)}
                            className="p-2 rounded-md text-gray-600 hover:bg-gray-100"
                            aria-label="Toggle menu"
                            aria-expanded={open}
                        >
                            {open ? <X size={24} /> : <Menu size={24} />}
                        </button>
                    </div>
                </div>
            </div>

            {open && (
                <div className="md:hidden border-t border-gray-200 bg-white px-4 py-3 space-y-1 animate-fade-in">
                    {user && (
                        <div className="flex items-center gap-3 px-3 py-2 mb-2">
                            <span className="h-10 w-10 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center">{initials}</span>
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-gray-900 truncate">{user.name}</p>
                                <p className="text-xs text-gray-500 capitalize">{user.role}</p>
                            </div>
                        </div>
                    )}
                    {links.map(l => (
                        <NavLink key={l.to} to={l.to} className={mobileLinkClass}>{l.label}</NavLink>
                    ))}
                    {profilePath && <NavLink to={profilePath} className={mobileLinkClass}>My Profile</NavLink>}
                    {user ? (
                        <button onClick={handleLogout} className="w-full text-left px-3 py-2 rounded-lg text-base font-medium text-red-600 hover:bg-red-50 flex items-center gap-2">
                            <LogOut size={18} /> Logout
                        </button>
                    ) : (
                        <div className="grid grid-cols-2 gap-3 pt-2">
                            <Link to="/login" className="text-center px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700">Login</Link>
                            <Link to="/register" className="text-center px-4 py-2 rounded-lg bg-indigo-600 text-sm font-medium text-white">Register</Link>
                        </div>
                    )}
                </div>
            )}
        </nav>
    );
};

export default Navbar;
