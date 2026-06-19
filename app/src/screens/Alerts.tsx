import { useNavigate } from 'react-router-dom';
import { BellOff } from 'lucide-react';
import { Page } from '../components/AppShell';
import { TopBar } from '../components/TopBar';
import { AlertCard } from '../components/AlertCard';
import { EmptyState } from '../components/EmptyState';
import { allAlerts } from '../lib/derive';
import { useStore } from '../store/store';

export function Alerts() {
  const { files } = useStore();
  const nav = useNavigate();
  const alerts = allAlerts(files);

  return (
    <>
      <TopBar title="Alerts" subtitle={`${alerts.length} active`} />
      <Page>
        {alerts.length === 0 ? (
          <EmptyState icon={BellOff} title="No alerts" sub="Everything is on track." />
        ) : (
          <div className="flex flex-col gap-2">
            {alerts.map((a, i) => (
              <AlertCard key={i} alert={a} onClick={() => nav(`/files/${a.fileId}`)} />
            ))}
          </div>
        )}
      </Page>
    </>
  );
}
