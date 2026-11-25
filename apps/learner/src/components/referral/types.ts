import type { ReferralStato, RiscattoRisposta } from '@formazione/contracts';

export interface ReferralCardProps {
  stato: ReferralStato | null;
  loading?: boolean;
  onRefresh?: () => void;
  onOpenRedeemModal?: () => void;
}

export interface RedeemCodeModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (risultato: RiscattoRisposta) => void;
}
