import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthService } from './utils/auth';

// Components
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import ProtectedRoute from './components/ProtectedRoute';
import ToastHost from './components/ui/Toast';

// Pages (lazy-loaded so the initial bundle stays small)
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Course = lazy(() => import('./pages/Course'));
const Lesson = lazy(() => import('./pages/Lesson'));
const SkillPassport = lazy(() => import('./pages/SkillPassport'));
const Certificate = lazy(() => import('./pages/Certificate'));
const Profile = lazy(() => import('./pages/Profile'));
const Settings = lazy(() => import('./pages/Settings'));
const FinalSkillCheck = lazy(() => import('./pages/FinalSkillCheck'));
const About = lazy(() => import('./pages/About'));
const ReviewDashboard = lazy(() => import('./pages/ReviewDashboard'));
const ReviewSession = lazy(() => import('./pages/ReviewSession'));
const Notebooks = lazy(() => import('./pages/Notebooks'));
const NotebookWorkspace = lazy(() => import('./pages/NotebookWorkspace'));
const VisualLearning = lazy(() => import('./pages/VisualLearning'));
const VisualTopic = lazy(() => import('./pages/VisualTopic'));
const InteractiveLearning = lazy(() => import('./pages/InteractiveLearning'));

function App() {
  const isAuthenticated = AuthService.isAuthenticated();

  return (
    <Router>
      <div className="min-h-screen bg-line-subtle">
        <Suspense fallback={<div className="p-6 text-sm text-ink-muted">Loading…</div>}>
        <Routes>
          {/* Public Routes */}
          <Route
            path="/"
            element={
              isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />
            }
          />
          <Route
            path="/register"
            element={
              isAuthenticated ? <Navigate to="/dashboard" replace /> : <Register />
            }
          />
          <Route
            path="/forgot-password"
            element={
              isAuthenticated ? <Navigate to="/dashboard" replace /> : <ForgotPassword />
            }
          />

          {/* Protected Routes - Main App Layout */}
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <div className="flex flex-col min-h-screen">
                  <Navbar />
                  <div className="flex flex-1 pt-24">
                    <Sidebar />
                    <main className="flex-1 lg:ml-64">
                      <Routes>
                        <Route path="/dashboard" element={<Dashboard />} />
                        <Route path="/course/:courseId" element={<Course />} />
                        <Route
                          path="/course/:courseId/lesson/:lessonId"
                          element={<Lesson />}
                        />
                        <Route path="/skill-passport" element={<SkillPassport />} />
                        <Route path="/notebooks" element={<Notebooks />} />
                        <Route
                          path="/notebooks/:notebookId"
                          element={<NotebookWorkspace />}
                        />
                        <Route path="/visual" element={<VisualLearning />} />
                        <Route
                          path="/visual/:topicId"
                          element={<VisualTopic />} />
                        <Route path="/interactive" element={<InteractiveLearning />} />
                        <Route path="/interactive/:experienceId" element={<InteractiveLearning />}
                        />
                        <Route path="/review" element={<ReviewDashboard />} />
                        <Route
                          path="/review/:courseId/:conceptId"
                          element={<ReviewSession />}
                        />
                        <Route
                          path="/final-skill-check"
                          element={<FinalSkillCheck />}
                        />
                        <Route path="/about" element={<About />} />
                        <Route
                          path="/certificate/:certificateId"
                          element={<Certificate />}
                        />
                        <Route path="/profile" element={<Profile />} />
                        <Route path="/settings" element={<Settings />} />
                        
                        {/* Fallback */}
                        <Route path="*" element={<Navigate to="/dashboard" replace />} />
                      </Routes>
                    </main>
                  </div>
                  <footer className="border-t border-line bg-surface">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                      <p className="text-sm text-ink-subtle">CrushLearn AI</p>
                    </div>
                  </footer>
                  <ToastHost />
                </div>
              </ProtectedRoute>
            }
          />
        </Routes>
        </Suspense>
      </div>
    </Router>
  );
}

export default App;
