import { Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { Dashboard } from './screens/Dashboard';
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

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Dashboard />} />
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
      <Route path="*" element={<Dashboard />} />
    </Routes>
  );
}
