import React, { useEffect } from "react";
import { Routes, Route, useLocation, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Editor from "./pages/Editor";
import Templates from "./pages/Templates";
import ATS from "./pages/ATS";
import Interview from "./pages/Interview";
import Download from "./pages/Download";
import Dashboard from "./pages/Dashboard";
import Import from "./pages/Import";
import Me from "./pages/Me";
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
        <Route path="/download" element={<Download />} />
        <Route path="/import" element={<Import />} />
        <Route path="/me" element={<Me />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Layout>
  );
}