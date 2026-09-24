import "@/App.css";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { Aperture } from "lucide-react";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import AuthCallback from "@/pages/AuthCallback";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import ProjectDetail from "@/pages/ProjectDetail";
import Studio from "@/pages/Studio";
import ProcessingPage from "@/pages/ProcessingPage";
import ProfileExtractor from "@/pages/ProfileExtractor";
import StyleLibrary from "@/pages/StyleLibrary";
import LearningModule from "@/pages/LearningModule";
import EngineLab from "@/pages/EngineLab";
import AutoBasic from "@/pages/AutoBasic";
import AlbumStudio from "@/pages/AlbumStudio";
import AIProviders from "@/pages/AIProviders";
import ValidationTool from "@/pages/ValidationTool";

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#101012]">
        <Aperture className="h-8 w-8 animate-spin text-emerald-400" />
      </div>
    );
  }
  if (!user) return <Navigate to="/" replace />;
  return children;
}

function AppRouter() {
  const location = useLocation();
  if (location.hash?.includes("session_id=")) return <AuthCallback />;

  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/project/:projectId" element={<ProtectedRoute><ProjectDetail /></ProtectedRoute>} />
      <Route path="/studio" element={<ProtectedRoute><Studio /></ProtectedRoute>} />
      <Route path="/processing" element={<ProtectedRoute><ProcessingPage /></ProtectedRoute>} />
      <Route path="/profiles" element={<ProtectedRoute><ProfileExtractor /></ProtectedRoute>} />
      <Route path="/styles" element={<ProtectedRoute><StyleLibrary /></ProtectedRoute>} />
      <Route path="/learning" element={<ProtectedRoute><LearningModule /></ProtectedRoute>} />
      <Route path="/engine-lab" element={<ProtectedRoute><EngineLab /></ProtectedRoute>} />
      <Route path="/auto-basic" element={<ProtectedRoute><AutoBasic /></ProtectedRoute>} />
      <Route path="/album" element={<ProtectedRoute><AlbumStudio /></ProtectedRoute>} />
      <Route path="/validation" element={<ProtectedRoute><ValidationTool /></ProtectedRoute>} />
      <Route path="/ai-providers" element={<ProtectedRoute><AIProviders /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRouter />
        <Toaster theme="dark" position="top-right" richColors />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
