import type {
  DuelloVista,
  StatoDuello,
  AnteprimaInvitoDuello,
  IniziaGiocataRisposta,
  ConsegnaRisposta,
  RisultatoDuelloRisposta,
} from '@formazione/contracts';

export interface ProDuelGuardCardProps {
  onUpgradePro?: () => void;
  onLearnMore?: () => void;
}

export interface DuelsHubCardProps {
  duelli: DuelloVista[];
  loading?: boolean;
  onRefresh?: () => void;
  onCreateDuel?: () => void;
  onEnterInviteCode?: () => void;
  onOpenDuel?: (duello: DuelloVista) => void;
}

export interface CreateDuelModalProps {
  visible: boolean;
  courses: Array<{ extraction_id: string; title: string; questionCount: number }>;
  onClose: () => void;
  onDuelCreated: (duelloId: string, codiceInvito: string) => void;
}

export interface DuelInvitePreviewModalProps {
  visible: boolean;
  inviteData: AnteprimaInvitoDuello | null;
  loading?: boolean;
  onClose: () => void;
  onAccept: (duelloId: string, codiceInvito: string) => void;
}

export interface DuelPlayModalProps {
  visible: boolean;
  duelloId: string;
  titoloCorso: string;
  playData: IniziaGiocataRisposta | null;
  onClose: () => void;
  onSubmit: (duelloId: string, risposte: Array<{ domanda_id: string; scelta: number | null; ms: number }>) => Promise<ConsegnaRisposta>;
}

export interface DuelResultModalProps {
  visible: boolean;
  duello: DuelloVista | null;
  resultData: RisultatoDuelloRisposta | null;
  onClose: () => void;
}
