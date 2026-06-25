import {
  BarChart3,
  Bell,
  CalendarCheck,
  CalendarDays,
  FileWarning,
  FolderOpen,
  LayoutDashboard,
  Settings,
  Ship,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export const NAV_ICONS: Record<string, LucideIcon> = {
  today: CalendarCheck,
  home: LayoutDashboard,
  calendar: CalendarDays,
  files: FolderOpen,
  'pending-docs': FileWarning,
  'pending-payments': Wallet,
  cha: Ship,
  reports: BarChart3,
  settings: Settings,
  alerts: Bell,
};
