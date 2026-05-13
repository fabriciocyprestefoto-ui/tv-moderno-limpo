// PIto LiveTV — Tipos idênticos ao projeto original PIto-main
export interface Program {
  id: string;
  title: string;
  time: string;
  startTime: string;
  endTime: string;
  description?: string;
  cast?: string[];
}

export interface ChannelQuality {
  label: string; // 'SD' | 'HD' | 'FHD' | '4K' | 'UHD'
  streamUrl: string;
}

/** Variante regional de um canal (ex: GLOBO SP, BAND RJ) */
export interface ChannelRegion {
  state: string; // código do estado: 'SP', 'RJ', 'MG', …
  affiliateLabel: string; // label completo: 'SP - SAO PAULO'
  streamUrl: string; // melhor qualidade disponível para esta região
  qualities: ChannelQuality[];
}

export interface PitoChannel {
  id: string;
  number: number;
  name: string;
  logo: string;
  category: string;
  currentProgram: Program;
  nextPrograms: Program[];
  streamUrl: string;
  qualities: ChannelQuality[]; // qualidades para canal não-regional (ou região padrão)
  regions?: ChannelRegion[]; // presente apenas em canais com variantes regionais
}

export interface PitoCategory {
  id: string;
  name: string;
  icon: string;
  count: number;
}
