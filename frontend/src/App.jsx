import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import StudentDashboard from './pages/StudentDashboard';
import StudentClubs from './pages/StudentClubs';
import StudentClubDetails from './pages/StudentClubDetails';
import StudentApply from './pages/StudentApply';
import StudentApplyHub from './pages/StudentApplyHub';
import StudentApplications from './pages/StudentApplications';
import StudentProfile from './pages/StudentProfile';
import CoordinatorDashboard from './pages/CoordinatorDashboard';
import CoordinatorDrives from './pages/CoordinatorDrives';
import CoordinatorClubs from './pages/CoordinatorClubs';
import Footer from './components/Footer';
import NotFound from './pages/NotFound';

const ProtectedRoute = ({ children, role }) => {
    const { user } = useAuth();
    if (!user) return <Navigate to="/login" />;
    if (role && user.role !== role) return <Navigate to="/" />;
    return children;
};

const ScrollToTop = () => {
    const { pathname } = useLocation();
    useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
    return null;
};

const PageTransition = ({ children }) => (
    <div className="page-transition">{children}</div>
);

const AppContent = () => {
    const { pathname } = useLocation();
    const isAuthPage = pathname === '/login' || pathname === '/register';
    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            <ScrollToTop />
            {!isAuthPage && <Navbar />}
            <main className="flex-1">
                <PageTransition key={pathname}>
                    <Routes>
                    <Route path="/" element={<Landing />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<Register />} />
                    
                    <Route path="/explore-clubs" element={<StudentClubs />} />
                    
                    <Route path="/student/dashboard" element={
                        <ProtectedRoute role="student">
                            <StudentDashboard />
                        </ProtectedRoute>
                    } />
                    <Route path="/student/clubs/:id" element={
                        <ProtectedRoute role="student">
                            <StudentClubDetails />
                        </ProtectedRoute>
                    } />
                    <Route path="/student/applications" element={
                        <ProtectedRoute role="student">
                            <StudentApplications />
                        </ProtectedRoute>
                    } />
                    <Route path="/student/apply" element={
                        <ProtectedRoute role="student">
                            <StudentApplyHub />
                        </ProtectedRoute>
                    } />
                    <Route path="/student/apply/:driveId" element={
                        <ProtectedRoute role="student">
                            <StudentApply />
                        </ProtectedRoute>
                    } />
                    
                    <Route path="/coordinator/dashboard" element={
                        <ProtectedRoute role="coordinator">
                            <CoordinatorDashboard />
                        </ProtectedRoute>
                    } />
                    <Route path="/coordinator/drives" element={
                        <ProtectedRoute role="coordinator">
                            <CoordinatorDrives />
                        </ProtectedRoute>
                    } />
                    <Route path="/coordinator/clubs" element={
                        <ProtectedRoute role="coordinator">
                            <CoordinatorClubs />
                        </ProtectedRoute>
                    } />
                    <Route path="/student/profile" element={
                        <ProtectedRoute role="student">
                            <StudentProfile />
                        </ProtectedRoute>
                    } />
                    <Route path="*" element={<NotFound />} />
                    </Routes>
                </PageTransition>
            </main>
            {!isAuthPage && <Footer />}
        </div>
    );
};

const App = () => {
    return (
        <AuthProvider>
            <Router>
                <AppContent />
            </Router>
        </AuthProvider>
    );
};

export default App;
