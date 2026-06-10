import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { ConversationDetailPage } from "../pages/ConversationDetailPage";
import { ConversationsPage } from "../pages/ConversationsPage";
import { SettingsPage } from "../pages/SettingsPage";
import { SetupPage } from "../pages/SetupPage";

export function AppRouter() {
  const navigate = useNavigate();

  return (
    <Routes>
      <Route
        path="/setup"
        element={<SetupPage onConnected={() => navigate("/conversations")} />}
      />
      <Route
        path="/conversations"
        element={
          <AppShell>
            <ConversationsPage />
          </AppShell>
        }
      />
      <Route
        path="/conversations/:id"
        element={
          <AppShell>
            <ConversationDetailPage />
          </AppShell>
        }
      />
      <Route
        path="/settings"
        element={
          <AppShell>
            <SettingsPage />
          </AppShell>
        }
      />
      <Route path="*" element={<Navigate to="/setup" replace />} />
    </Routes>
  );
}
