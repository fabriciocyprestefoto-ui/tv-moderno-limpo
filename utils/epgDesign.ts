/**
 * Padrão visual EPG — usado em LiveTV e demais páginas
 * - Sem linhas finas separadoras (usar espaçamento e cards)
 * - Cards com cantos arredondados
 * - Efeito 3D/sombra sutil em cards não selecionados
 * - Roxo translúcido para destaque
 * - Espaçamento consistente (space-y-2.5)
 */
export const epgDesign = {
  /** Card não selecionado — sombra 3D, sem borda forte */
  card: 'rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 shadow-[0_4px_12px_rgba(0,0,0,0.4),0_2px_4px_rgba(0,0,0,0.2)] hover:shadow-[0_6px_16px_rgba(0,0,0,0.5),0_2px_6px_rgba(0,0,0,0.25)]',
  /** Card selecionado/focado — roxo */
  cardActive:
    'rounded-2xl bg-gradient-to-r from-[#A855F7]/40 to-[#A855F7]/10 border border-white/20 shadow-[0_8px_32px_rgba(168,85,247,0.3)]',
  /** Painel vidro — fundo translúcido com blur */
  panel: 'bg-white/[0.08] backdrop-blur-xl border border-white/20 rounded-2xl',
  /** Espaçamento entre itens */
  spacing: 'space-y-2.5',
  /** Botão secundário */
  button: 'rounded-xl bg-white/10 backdrop-blur-md hover:bg-white/20 border border-white/20',
  /** Botão primário/destaque */
  buttonPrimary: 'rounded-xl bg-[#A855F7]/40 hover:bg-[#A855F7]/50 border border-[#A855F7]/50',
} as const;
