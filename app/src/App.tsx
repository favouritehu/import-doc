import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AppShell } from './components/AppShell';
import { useStore } from './store/store';
import { Welcome } from './screens/Welcome';
import { Dashboard } from './screens/Dashboard';
import { Today } from './screens/Today';
import { Calendar } from './screens/Calendar';
import { FilesList } from './screens/FilesList';
import { CreateFile } from './screens/CreateFile';
import { FileDetail } from './screens/FileDetail';
import { PendingDocs } from './screens/PendingDocs';
import { PendingPayments } from './screens/PendingPayments';
import { ChaDesk } from './screens/ChaDesk';
import { Reports } from './screens/Reports';
import { Settings } from './screens/Settings';
import { Alerts } from './screens/Alerts';
import { MagicLinkPage } from './screens/MagicLinkPage';

/** Internal routes require a signed-in user (Phase A: demo sign-in). External
 *  magic-link routes stay public. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useStore();
  if (!user) return <Navigate to="/welcome" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/welcome" element={<Welcome />} />

      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/today" element={<Today />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/files" element={<FilesList />} />
        <Route path="/files/new" element={<CreateFile />} />
        <Route path="/files/:id" element={<FileDetail />} />
        <Route path="/pending-docs" element={<PendingDocs />} />
        <Route path="/pending-payments" element={<PendingPayments />} />
        <Route path="/cha-desk" element={<ChaDesk />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/alerts" element={<Alerts />} />
      </Route>

      <Route path="/u/:fileNumber/fwd/:token" element={<MagicLinkPage party="forwarder" />} />
      <Route path="/u/:fileNumber/cha/:token" element={<MagicLinkPage party="cha" />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
