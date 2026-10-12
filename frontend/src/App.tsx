import { useEffect, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Clients from './pages/Clients'
import Analyses from './pages/Analyses'
import Reports from './pages/Reports'
import Discovery from './pages/Discovery'
import Profile from './pages/Profile'
import Configure from './pages/Configure'
import Analysis from './pages/Analysis'
import Report from './pages/Report'
import Register from './pages/Register'
import ResetPassword from './pages/ResetPassword'
import { useStore } from './store'
import { PageLoading } from './components/ui'
import AdminLayout from './pages/admin/AdminLayout'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminRMs from './pages/admin/AdminRMs'
import AdminReviews from './pages/admin/AdminReviews'
import AdminLogin from './pages/admin/AdminLogin'

// New page → start at the top (otherwise the browser keeps the previous page's scroll position).
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

// Signed-in RMs only; everyone else goes back to the landing page. The manager has no RM workspace → /admin.
function RequireAuth({ children }: { children: ReactNode }) {
  const { loading, signedIn, online, isAdmin, rm, authMode } = useStore()
  if (loading) return <PageLoading />
  if (!signedIn && online !== false) return <Navigate to="/" replace />
  if (authMode === 'supabase' && isAdmin && !rm) return <Navigate to="/admin" replace />
  return <>{children}</>
}

// Admin panel: the manager account only. Anyone else sees the manager sign-in page.
function RequireAdmin({ children }: { children: ReactNode }) {
  const { loading, signedIn, isAdmin } = useStore()
  if (loading) return <PageLoading />
  if (!signedIn || !isAdmin) return <AdminLogin />
  return <>{children}</>
}

export default function App() {
  return (
    <>
    <ScrollToTop />
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/analyses" element={<Analyses />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/discovery" element={<Discovery />} />
        <Route path="/profile/:clientId" element={<Profile />} />
        <Route path="/configure/:clientId" element={<Configure />} />
        <Route path="/analysis/:analysisId" element={<Analysis />} />
        <Route path="/report/:analysisId" element={<Report />} />
      </Route>
      <Route
        path="/admin"
        element={
          <RequireAdmin>
            <AdminLayout />
          </RequireAdmin>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="rms" element={<AdminRMs />} />
        <Route path="reviews" element={<AdminReviews />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  )
}
