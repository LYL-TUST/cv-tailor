import React, { useEffect } from "react";
import { Routes, Route, useLocation, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Editor from "./pages/Editor";
import Templates from "./pages/Templates";
import ATS from "./pages/ATS";
import Interview from "./pages/Interview";
import Dashboard from "./pages/Dashboard";
import Import from "./pages/Import";
import Me from "./pages/Me";
import MeResumes from "./pages/me/MeResumes";
import MeAtsHistory from "./pages/me/MeAtsHistory";
import MeInterviewHistory from "./pages/me/MeInterviewHistory";
import MeRadar from "./pages/me/MeRadar";
import MeFavorites from "./pages/me/MeFavorites";
import MeBackup from "./pages/me/MeBackup";
import MeSync from "./pages/me/MeSync";
import Analytics from "./pages/Analytics";
import { track } from "./utils/analytics";

/** 路由级页面访问埋点：page_view { page, referrer } */
function PageViewTracker() {
  const location = useLocation();
  useEffect(() => {
    track("page_view", { page: location.pathname, referrer: document.referrer });
  }, [location.pathname]);
  return null;
}

export default function App() {
  return (
    <Layout>
      <PageViewTracker />
      <Routes>
        {/* 首页直接进工作台（本地优先工具：打开即用，不设营销欢迎页） */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/editor" element={<Editor />} />
        <Route path="/templates" element={<Templates />} />
        <Route path="/ats" element={<ATS />} />
        <Route path="/interview" element={<Interview />} />
        <Route path="/import" element={<Import />} />
        {/* 个人中心：二级路由板块化（默认落到「我的简历」） */}
        <Route path="/me" element={<Me />}>
          <Route index element={<Navigate to="/me/resumes" replace />} />
          <Route path="resumes" element={<MeResumes />} />
          <Route path="ats" element={<MeAtsHistory />} />
          <Route path="interviews" element={<MeInterviewHistory />} />
          <Route path="radar" element={<MeRadar />} />
          <Route path="favorites" element={<MeFavorites />} />
          <Route path="backup" element={<MeBackup />} />
          <Route path="sync" element={<MeSync />} />
        </Route>
        <Route path="/analytics" element={<Analytics />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Layout>
  );
}