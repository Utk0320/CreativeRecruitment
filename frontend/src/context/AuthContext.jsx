import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from '../api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        axios.get('/auth/me')
            .then(res => setUser(res.data))
            .catch(() => setUser(null))
            .finally(() => setLoading(false));
    }, []);

    const logout = useCallback(() => {
        setUser(null);
    }, []);

    useEffect(() => {
        window.addEventListener('creative-recruit-unauthorized', logout);
        return () => window.removeEventListener('creative-recruit-unauthorized', logout);
    }, [logout]);

    const login = async (email, password) => {
        const res = await axios.post('/auth/login', { email, password });
        const { user } = res.data;
        setUser(user);
        return user;
    };

    const register = async (userData) => {
        return axios.post('/auth/register', userData);
    };

    const signOut = async () => {
        try {
            await axios.post('/auth/logout');
        } catch {
            // Clear local identity even if the session has already expired.
        } finally {
            setUser(null);
        }
    };

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
    }

    return (
        <AuthContext.Provider value={{ user, login, register, logout: signOut, setUser }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
