import type { UtenteVista, Piano } from '@formazione/contracts';

export type AuthMode = 'welcome' | 'login' | 'register' | 'verify_email' | 'reset_password';

export interface AuthModalProps {
  visible: boolean;
  onClose: () => void;
  onAuthSuccess: (user: UtenteVista) => void;
  initialMode?: AuthMode;
  initialReferralCode?: string;
}

export interface ProfileCardProps {
  utente: UtenteVista | null;
  onUpdateName?: (newName: string) => Promise<void>;
  onOpenAuth?: () => void;
  onLogout?: () => void;
  onNavigateToReferral?: () => void;
  onNavigateToDuels?: () => void;
  loading?: boolean;
}

export interface CourseLimitBannerProps {
  corsiUsati: number;
  limiteEffettivo: number | null;
  limiteBase: number | null;
  corsiExtraReferral: number;
  piano: Piano;
  referralDisponibile: boolean;
  onInviteFriend?: () => void;
  onUpgradePro?: () => void;
}
