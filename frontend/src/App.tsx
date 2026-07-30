import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useAuth } from './contexts/AuthContext'

// Pages
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import JoinPage from './pages/JoinPage'
import AdminDashboard from './pages/admin/AdminDashboard'
import SessionManager from './pages/admin/SessionManager'
import QuestionEditor from './pages/admin/QuestionEditor'
import LiveControl from './pages/admin/LiveControl'
import ParticipantLobby from './pages/participant/ParticipantLobby'
import ParticipantQuiz from './pages/participant/ParticipantQuiz'
import DisplayEntry from './pages/display/DisplayEntry'
import DisplayScreen from './pages/display/DisplayScreen'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function App() {
  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: 'var(--toast-bg, #fff)',
            color: 'var(--toast-color, #333)',
          },
        }}
      />
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/join" element={<JoinPage />} />
        <Route path="/display" element={<DisplayEntry />} />
        <Route path="/display/:sessionId" element={<DisplayScreen />} />

        {/* Participant routes */}
        <Route path="/lobby/:sessionId" element={<ParticipantLobby />} />
        <Route path="/quiz/:sessionId" element={<ParticipantQuiz />} />

        {/* Admin routes */}
        <Route path="/admin" element={
          <ProtectedRoute><AdminDashboard /></ProtectedRoute>
        } />
        <Route path="/admin/session/:sessionId" element={
          <ProtectedRoute><SessionManager /></ProtectedRoute>
        } />
        <Route path="/admin/session/:sessionId/questions" element={
          <ProtectedRoute><QuestionEditor /></ProtectedRoute>
        } />
        <Route path="/admin/session/:sessionId/live" element={
          <ProtectedRoute><LiveControl /></ProtectedRoute>
        } />

        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/join" replace />} />
        <Route path="*" element={<Navigate to="/join" replace />} />
      </Routes>
    </>
  )
}

export default App
