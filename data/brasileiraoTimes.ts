/**
 * data/brasileiraoTimes.ts
 * Lista de times do Brasileirão Série A com IDs do TheSportsDB e Wikipedia
 */

export interface Team {
  id: string;
  name: string;
  tsdbId: string;
  wiki: string;
  colors: {
    primary: string;
    secondary?: string;
  };
}

export const BRASILEIRAO_TEAMS: Team[] = [
  {
    id: 'flamengo',
    name: 'Flamengo',
    tsdbId: '133250',
    wiki: 'Clube_de_Regatas_do_Flamengo',
    colors: { primary: '#E50914', secondary: '#000000' },
  },
  {
    id: 'palmeiras',
    name: 'Palmeiras',
    tsdbId: '134796',
    wiki: 'Sociedade_Esportiva_Palmeiras',
    colors: { primary: '#006437', secondary: '#FFFFFF' },
  },
  {
    id: 'corinthians',
    name: 'Corinthians',
    tsdbId: '133249',
    wiki: 'Sport_Club_Corinthians_Paulista',
    colors: { primary: '#000000', secondary: '#FFFFFF' },
  },
  {
    id: 'sao-paulo',
    name: 'São Paulo',
    tsdbId: '133248',
    wiki: 'São_Paulo_Futebol_Clube',
    colors: { primary: '#FF0000', secondary: '#000000' },
  },
  {
    id: 'botafogo',
    name: 'Botafogo',
    tsdbId: '134771',
    wiki: 'Botafogo_de_Futebol_e_Regatas',
    colors: { primary: '#000000', secondary: '#FFFFFF' },
  },
  {
    id: 'fluminense',
    name: 'Fluminense',
    tsdbId: '133251',
    wiki: 'Fluminense_Football_Club',
    colors: { primary: '#880038', secondary: '#006837' },
  },
  {
    id: 'gremio',
    name: 'Grêmio',
    tsdbId: '134795',
    wiki: 'Grêmio_Foot-Ball_Porto_Alegrense',
    colors: { primary: '#004A8D', secondary: '#000000' },
  },
  {
    id: 'internacional',
    name: 'Internacional',
    tsdbId: '134802',
    wiki: 'Sport_Club_Internacional',
    colors: { primary: '#E50914', secondary: '#FFFFFF' },
  },
  {
    id: 'atletico-mg',
    name: 'Atlético-MG',
    tsdbId: '134797',
    wiki: 'Clube_Atlético_Mineiro',
    colors: { primary: '#000000', secondary: '#FFFFFF' },
  },
  {
    id: 'cruzeiro',
    name: 'Cruzeiro',
    tsdbId: '134798',
    wiki: 'Cruzeiro_Esporte_Clube',
    colors: { primary: '#003DA5', secondary: '#FFFFFF' },
  },
  {
    id: 'athletico-pr',
    name: 'Athletico-PR',
    tsdbId: '134799',
    wiki: 'Club_Athletico_Paranaense',
    colors: { primary: '#B3000A', secondary: '#000000' },
  },
  {
    id: 'santos',
    name: 'Santos',
    tsdbId: '133252',
    wiki: 'Santos_Futebol_Clube',
    colors: { primary: '#000000', secondary: '#FFFFFF' },
  },
  {
    id: 'vasco',
    name: 'Vasco',
    tsdbId: '134800',
    wiki: 'Club_de_Regatas_Vasco_da_Gama',
    colors: { primary: '#000000', secondary: '#FFFFFF' },
  },
  {
    id: 'bahia',
    name: 'Bahia',
    tsdbId: '134803',
    wiki: 'Esporte_Clube_Bahia',
    colors: { primary: '#004A8D', secondary: '#E50914' },
  },
  {
    id: 'fortaleza',
    name: 'Fortaleza',
    tsdbId: '140082',
    wiki: 'Fortaleza_Esporte_Clube',
    colors: { primary: '#004A8D', secondary: '#E50914' },
  },
  {
    id: 'bragantino',
    name: 'Bragantino',
    tsdbId: '140259',
    wiki: 'Red_Bull_Bragantino',
    colors: { primary: '#E50914', secondary: '#FFFFFF' },
  },
  {
    id: 'cuiaba',
    name: 'Cuiabá',
    tsdbId: '140258',
    wiki: 'Cuiabá_Esporte_Clube',
    colors: { primary: '#006837', secondary: '#FFD700' },
  },
  {
    id: 'goias',
    name: 'Goiás',
    tsdbId: '134807',
    wiki: 'Goiás_Esporte_Clube',
    colors: { primary: '#006837', secondary: '#FFFFFF' },
  },
  {
    id: 'coritiba',
    name: 'Coritiba',
    tsdbId: '134801',
    wiki: 'Coritiba_Foot_Ball_Club',
    colors: { primary: '#006837', secondary: '#FFFFFF' },
  },
  {
    id: 'juventude',
    name: 'Juventude',
    tsdbId: '140260',
    wiki: 'Esporte_Clube_Juventude',
    colors: { primary: '#006837', secondary: '#FFFFFF' },
  },
];
