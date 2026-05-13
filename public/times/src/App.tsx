import { motion } from "motion/react";
import { Calendar, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { fetchWikipediaLogo } from "./services/wikipediaService";

interface Team {
  name: string;
  officialName: string;
  logo: string;
  primaryColor: string;
  secondaryColor: string;
}

interface Match {
  id: string;
  homeTeam: Team;
  awayTeam: Team;
  time: string;
  date: string;
  stadium: string;
  channelName: string;
  channelLogo: string;
}

const INITIAL_TEAMS: Record<string, Team> = {
  vitoria: {
    name: "Vitória",
    officialName: "Esporte Clube Vitória",
    logo: "https://upload.wikimedia.org/wikipedia/pt/1/1c/Escudo_do_Esporte_Clube_Vit%C3%B3ria.png",
    primaryColor: "#ff0000",
    secondaryColor: "#000000",
  },
  saopaulo: {
    name: "São Paulo",
    officialName: "São Paulo FC",
    logo: "https://upload.wikimedia.org/wikipedia/pt/4/4b/S%C3%A3o_Paulo_Futebol_Clube.png",
    primaryColor: "#ff2a2a",
    secondaryColor: "#111111",
  },
  remo: {
    name: "Remo",
    officialName: "Clube do Remo",
    logo: "https://upload.wikimedia.org/wikipedia/pt/a/a3/Clube_do_Remo_2013.png",
    primaryColor: "#001a4d",
    secondaryColor: "#00081a",
  },
  vasco: {
    name: "Vasco",
    officialName: "Club de Regatas Vasco da Gama",
    logo: "https://upload.wikimedia.org/wikipedia/pt/a/ac/CRVascodaGama.png",
    primaryColor: "#222222",
    secondaryColor: "#000000",
  },
  fluminense: {
    name: "Fluminense",
    officialName: "Fluminense Football Club",
    logo: "https://upload.wikimedia.org/wikipedia/pt/a/a3/Fluminense_FC_escudo.png",
    primaryColor: "#70001a",
    secondaryColor: "#4a0010",
  },
  flamengo: {
    name: "Flamengo",
    officialName: "Clube de Regatas do Flamengo",
    logo: "https://upload.wikimedia.org/wikipedia/pt/2/2e/Flamengo_brazilian_v_01.png",
    primaryColor: "#ff2a2a",
    secondaryColor: "#3a0000",
  },
  mirassol: {
    name: "Mirassol",
    officialName: "Mirassol Futebol Clube",
    logo: "https://upload.wikimedia.org/wikipedia/pt/0/02/Escudo_Mirassol_FC.png",
    primaryColor: "#ffff00",
    secondaryColor: "#008000",
  },
  bahia: {
    name: "Bahia",
    officialName: "Esporte Clube Bahia",
    logo: "https://upload.wikimedia.org/wikipedia/pt/b/b4/ECBahia_logo.png",
    primaryColor: "#1e3a8a",
    secondaryColor: "#111827",
  },
  santos: {
    name: "Santos",
    officialName: "Santos Futebol Clube",
    logo: "https://upload.wikimedia.org/wikipedia/commons/3/35/Santos_logo.png",
    primaryColor: "#ffffff",
    secondaryColor: "#111111",
  },
  atleticomg: {
    name: "Atlético",
    officialName: "Clube Atlético Mineiro",
    logo: "https://upload.wikimedia.org/wikipedia/pt/e/e5/Clube_Atl%C3%A9tico_Mineiro_logo.png",
    primaryColor: "#333333",
    secondaryColor: "#000000",
  },
  internacional: {
    name: "Internacional",
    officialName: "Sport Club Internacional",
    logo: "https://upload.wikimedia.org/wikipedia/commons/f/f1/Escudo_do_Sport_Club_Internacional.png",
    primaryColor: "#f00000",
    secondaryColor: "#4a0000",
  },
  gremio: {
    name: "Grêmio",
    officialName: "Grêmio Foot-Ball Porto Alegrense",
    logo: "https://upload.wikimedia.org/wikipedia/pt/a/a3/Gr%C3%AAmio_logo.png",
    primaryColor: "#0d80bf",
    secondaryColor: "#000000",
  },
  athleticopr: {
    name: "Athletico-PR",
    officialName: "Club Athletico Paranaense",
    logo: "https://upload.wikimedia.org/wikipedia/pt/c/c7/Club_Athletico_Paranaense_logo.png",
    primaryColor: "#ff0000",
    secondaryColor: "#000000",
  },
  chapecoense: {
    name: "Chapecoense",
    officialName: "Associação Chapecoense de Futebol",
    logo: "https://upload.wikimedia.org/wikipedia/pt/d/d4/Chapecoense_logo.png",
    primaryColor: "#00401a",
    secondaryColor: "#00200d",
  },
  botafogo: {
    name: "Botafogo",
    officialName: "Botafogo de Futebol e Regatas",
    logo: "https://upload.wikimedia.org/wikipedia/pt/d/d2/Botafogo_de_Futebol_e_Regatas_logo.png",
    primaryColor: "#000000",
    secondaryColor: "#222222",
  },
  coritiba: {
    name: "Coritiba",
    officialName: "Coritiba Foot Ball Club",
    logo: "https://upload.wikimedia.org/wikipedia/pt/0/07/Escudo_Coritiba.png",
    primaryColor: "#006400",
    secondaryColor: "#002200",
  },
  cruzeiro: {
    name: "Cruzeiro",
    officialName: "Cruzeiro Esporte Clube",
    logo: "https://upload.wikimedia.org/wikipedia/pt/b/b4/Cruzeiro_Esporte_Clube_logo.png",
    primaryColor: "#0033cc",
    secondaryColor: "#001144",
  },
  bragantino: {
    name: "Bragantino",
    officialName: "Red Bull Bragantino",
    logo: "https://upload.wikimedia.org/wikipedia/pt/9/9e/Red_Bull_Bragantino_logo.png",
    primaryColor: "#ff0000",
    secondaryColor: "#2a0000",
  },
  corinthians: {
    name: "Corinthians",
    officialName: "Sport Club Corinthians Paulista",
    logo: "https://upload.wikimedia.org/wikipedia/pt/b/b3/Corinthians_simbolo.png",
    primaryColor: "#1a1a1a",
    secondaryColor: "#000000",
  },
  palmeiras: {
    name: "Palmeiras",
    officialName: "Sociedade Esportiva Palmeiras",
    logo: "https://upload.wikimedia.org/wikipedia/pt/1/10/Palmeiras_logo.png",
    primaryColor: "#1db954",
    secondaryColor: "#001f14",
  },
};

const INITIAL_MATCHES: Match[] = [
  {
    id: "test-match",
    homeTeam: INITIAL_TEAMS.flamengo,
    awayTeam: INITIAL_TEAMS.palmeiras,
    time: "21:30",
    date: "Qua., 15/04",
    stadium: "Maracanã",
    channelName: "SporTV",
    channelLogo: "https://upload.wikimedia.org/wikipedia/pt/2/2a/SporTV_logo_2011.png",
  },
  {
    id: "1",
    homeTeam: INITIAL_TEAMS.vitoria,
    awayTeam: INITIAL_TEAMS.saopaulo,
    time: "16:30",
    date: "Sáb., 11/04",
    stadium: "Barradão",
    channelName: "SporTV",
    channelLogo: "https://upload.wikimedia.org/wikipedia/pt/2/2a/SporTV_logo_2011.png",
  },
  {
    id: "2",
    homeTeam: INITIAL_TEAMS.remo,
    awayTeam: INITIAL_TEAMS.vasco,
    time: "16:30",
    date: "Sáb., 11/04",
    stadium: "Baenão",
    channelName: "SporTV",
    channelLogo: "https://upload.wikimedia.org/wikipedia/pt/2/2a/SporTV_logo_2011.png",
  },
  {
    id: "3",
    homeTeam: INITIAL_TEAMS.fluminense,
    awayTeam: INITIAL_TEAMS.flamengo,
    time: "18:30",
    date: "Sáb., 11/04",
    stadium: "Maracanã",
    channelName: "SporTV",
    channelLogo: "https://upload.wikimedia.org/wikipedia/pt/2/2a/SporTV_logo_2011.png",
  },
  {
    id: "4",
    homeTeam: INITIAL_TEAMS.mirassol,
    awayTeam: INITIAL_TEAMS.bahia,
    time: "18:30",
    date: "Sáb., 11/04",
    stadium: "Maião",
    channelName: "SporTV",
    channelLogo: "https://upload.wikimedia.org/wikipedia/pt/2/2a/SporTV_logo_2011.png",
  },
  {
    id: "5",
    homeTeam: INITIAL_TEAMS.santos,
    awayTeam: INITIAL_TEAMS.atleticomg,
    time: "20:00",
    date: "Sáb., 11/04",
    stadium: "Vila Belmiro",
    channelName: "SporTV",
    channelLogo: "https://upload.wikimedia.org/wikipedia/pt/2/2a/SporTV_logo_2011.png",
  },
  {
    id: "6",
    homeTeam: INITIAL_TEAMS.internacional,
    awayTeam: INITIAL_TEAMS.gremio,
    time: "20:30",
    date: "Sáb., 11/04",
    stadium: "Beira-Rio",
    channelName: "SporTV",
    channelLogo: "https://upload.wikimedia.org/wikipedia/pt/2/2a/SporTV_logo_2011.png",
  },
  {
    id: "7",
    homeTeam: INITIAL_TEAMS.athleticopr,
    awayTeam: INITIAL_TEAMS.chapecoense,
    time: "11:00",
    date: "Dom., 12/04",
    stadium: "Ligga Arena",
    channelName: "SporTV",
    channelLogo: "https://upload.wikimedia.org/wikipedia/pt/2/2a/SporTV_logo_2011.png",
  },
  {
    id: "8",
    homeTeam: INITIAL_TEAMS.botafogo,
    awayTeam: INITIAL_TEAMS.coritiba,
    time: "16:00",
    date: "Dom., 12/04",
    stadium: "Nilton Santos",
    channelName: "SporTV",
    channelLogo: "https://upload.wikimedia.org/wikipedia/pt/2/2a/SporTV_logo_2011.png",
  },
  {
    id: "9",
    homeTeam: INITIAL_TEAMS.cruzeiro,
    awayTeam: INITIAL_TEAMS.bragantino,
    time: "18:30",
    date: "Dom., 12/04",
    stadium: "Mineirão",
    channelName: "SporTV",
    channelLogo: "https://upload.wikimedia.org/wikipedia/pt/2/2a/SporTV_logo_2011.png",
  },
  {
    id: "10",
    homeTeam: INITIAL_TEAMS.corinthians,
    awayTeam: INITIAL_TEAMS.palmeiras,
    time: "18:30",
    date: "Dom., 12/04",
    stadium: "Neo Química Arena",
    channelName: "SporTV",
    channelLogo: "https://upload.wikimedia.org/wikipedia/pt/2/2a/SporTV_logo_2011.png",
  },
];

const SportvLogo = () => (
  <div className="relative h-6 md:h-10 flex items-center overflow-hidden rounded-sm shadow-xl border border-white/10">
    {/* Background Bar */}
    <div className="absolute inset-0 flex">
      <div className="w-[70%] h-full bg-gradient-to-b from-[#005282] via-[#003d63] to-[#002a45]" />
      <div className="w-[30%] h-full bg-gradient-to-b from-[#e30613] via-[#b5050f] to-[#8a040c]" />
      {/* Mesh Pattern Overlay */}
      <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 0)', backgroundSize: '4px 4px' }} />
    </div>
    
    {/* Text */}
    <div className="relative px-3 md:px-6 flex items-center justify-center h-full">
      <span className="text-white font-title italic font-black text-[10px] md:text-lg tracking-tighter drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] uppercase">
        Sportv
      </span>
    </div>
    
    {/* Glossy Overlay */}
    <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent h-1/2" />
  </div>
);

function MatchCard({ match, index }: { match: Match; index: number; key?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.15 }}
      className="relative w-full aspect-video rounded-3xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.8)] border border-white/10 group"
    >
      {/* Background Split */}
      <div className="absolute inset-0 flex">
        {/* Left Side (Home) */}
        <div 
          className="w-1/2 h-full relative overflow-hidden"
          style={{ 
            background: `radial-gradient(circle at center, ${match.homeTeam.primaryColor} 0%, ${match.homeTeam.secondaryColor} 100%)` 
          }}
        >
          {/* Blurred Logo Background */}
          {match.homeTeam.logo && (
            <img 
              src={match.homeTeam.logo} 
              alt="" 
              className="absolute inset-0 w-full h-full object-cover opacity-20 blur-2xl scale-150"
              referrerPolicy="no-referrer"
            />
          )}
          <div className="absolute inset-0 particles opacity-30" />
          <div className="absolute inset-0 flare opacity-40" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/40 to-transparent" />
        </div>

        {/* Right Side (Away) */}
        <div 
          className="w-1/2 h-full relative overflow-hidden"
          style={{ 
            background: `radial-gradient(circle at center, ${match.awayTeam.primaryColor} 0%, ${match.awayTeam.secondaryColor} 100%)` 
          }}
        >
          {/* Blurred Logo Background */}
          {match.awayTeam.logo && (
            <img 
              src={match.awayTeam.logo} 
              alt="" 
              className="absolute inset-0 w-full h-full object-cover opacity-20 blur-2xl scale-150"
              referrerPolicy="no-referrer"
            />
          )}
          <div className="absolute inset-0 particles opacity-30" />
          <div className="absolute inset-0 flare opacity-40" />
          <div className="absolute inset-0 bg-gradient-to-l from-black/40 to-transparent" />
        </div>
      </div>

      {/* Central Separator */}
      <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[1px] z-20">
        <div 
          className="h-full bg-white/20 backdrop-blur-sm shadow-[0_0_10px_rgba(255,255,255,0.3)]"
          style={{ 
            background: `linear-gradient(to bottom, transparent, rgba(255,255,255,0.5), rgba(255,255,255,0.5), transparent)`
          }} 
        />
        
        {/* VS Button (30% Larger) */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30">
          <div className="glass-pill px-8 py-3 rounded-2xl border border-white/20 shadow-[0_0_30px_rgba(255,255,255,0.15)] backdrop-blur-xl">
            <span className="text-4xl font-black italic tracking-tighter text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.6)]">
              VS
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="absolute inset-0 z-10 flex flex-col p-8">
        {/* Teams Container */}
        <div className="flex-1 flex items-center justify-between px-4 md:px-12">
          {/* Home Team Column */}
          <div className="flex flex-col items-center gap-6 w-1/3">
            <motion.h3 
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="text-lg md:text-3xl font-title italic font-black text-white uppercase tracking-tighter drop-shadow-2xl text-center whitespace-nowrap"
            >
              {match.homeTeam.name}
            </motion.h3>
            <motion.div
              whileHover={{ scale: 1.1, rotate: -5 }}
              className="relative"
            >
              <div 
                className="absolute inset-0 blur-3xl opacity-60 animate-pulse-glow"
                style={{ backgroundColor: match.homeTeam.primaryColor }}
              />
              <img 
                src={match.homeTeam.logo} 
                alt={match.homeTeam.name}
                className="h-32 md:h-48 w-auto object-contain relative z-10 drop-shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
                referrerPolicy="no-referrer"
              />
            </motion.div>
          </div>

          {/* Spacer for VS */}
          <div className="w-12" />

          {/* Away Team Column */}
          <div className="flex flex-col items-center gap-6 w-1/3">
            <motion.h3 
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="text-lg md:text-3xl font-title italic font-black text-white uppercase tracking-tighter drop-shadow-2xl text-center whitespace-nowrap"
            >
              {match.awayTeam.name}
            </motion.h3>
            <motion.div
              whileHover={{ scale: 1.1, rotate: 5 }}
              className="relative"
            >
              <div 
                className="absolute inset-0 blur-3xl opacity-60 animate-pulse-glow"
                style={{ backgroundColor: match.awayTeam.primaryColor }}
              />
              <img 
                src={match.awayTeam.logo} 
                alt={match.awayTeam.name}
                className="h-32 md:h-48 w-auto object-contain relative z-10 drop-shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
                referrerPolicy="no-referrer"
              />
            </motion.div>
          </div>
        </div>

        {/* Bottom Info Bar (Glass Effect) */}
        <div className="mt-auto -mx-8 -mb-8 bg-black/40 backdrop-blur-md p-4 px-8 border-t border-white/5 flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2 text-white font-bold text-base md:text-lg tracking-tight">
              <span>{match.date} às {match.time}</span>
            </div>
            <div className="flex items-center gap-2 text-white/50 font-medium text-[10px] md:text-xs uppercase tracking-widest">
              <span>{match.stadium}</span>
            </div>
          </div>

          <div className="flex items-center">
            <SportvLogo />
          </div>
        </div>
      </div>

      {/* Hover Overlay */}
      <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 transition-colors duration-500 pointer-events-none" />
    </motion.div>
  );
}

export default function App() {
  const [matches, setMatches] = useState<Match[]>(INITIAL_MATCHES);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadLogos() {
      setIsLoading(true);
      const updatedMatches = await Promise.all(
        INITIAL_MATCHES.map(async (match) => {
          const [homeLogo, awayLogo] = await Promise.all([
            fetchWikipediaLogo(match.homeTeam.officialName),
            fetchWikipediaLogo(match.awayTeam.officialName)
          ]);
          
          return {
            ...match,
            homeTeam: {
              ...match.homeTeam,
              logo: homeLogo || match.homeTeam.logo,
            },
            awayTeam: {
              ...match.awayTeam,
              logo: awayLogo || match.awayTeam.logo,
            },
            // Keep the channel logo fixed as requested
            channelLogo: match.channelLogo,
          };
        })
      );
      setMatches(updatedMatches);
      setIsLoading(false);
    }
    loadLogos();
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center py-16 px-6 md:px-12 bg-[#2e0b6b]">
      {/* Background Glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[600px] bg-white/5 blur-[180px] rounded-full" />
      </div>

      {/* Header */}
      <motion.header 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-20 relative z-10"
      >
        <div className="flex items-center justify-center gap-4 mb-4">
          <div className="h-[1px] w-12 bg-gradient-to-r from-transparent to-white/20" />
          <span className="text-xs font-black tracking-[0.5em] text-white/40 uppercase">Live Dashboard</span>
          <div className="h-[1px] w-12 bg-gradient-to-l from-transparent to-white/20" />
        </div>
        <h1 className="text-6xl md:text-8xl font-title italic font-black tracking-tighter text-white uppercase text-shadow-lg">
          Jogos do Dia
        </h1>
        <div className="flex items-center justify-center gap-6 mt-6">
          <div className="flex items-center gap-2 glass-pill px-4 py-1.5 rounded-full">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/80">Ao Vivo</span>
          </div>
          <div className="flex items-center gap-2 text-white/40 font-bold text-[10px] tracking-widest uppercase">
            <Calendar size={14} />
            <span>{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
          </div>
        </div>
      </motion.header>

      {/* Grid Container */}
      <main className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-2 gap-12 relative z-10">
        {isLoading ? (
          <div className="col-span-full flex flex-col items-center justify-center gap-4 py-20">
            <Loader2 className="w-12 h-12 text-white/20 animate-spin" />
            <span className="text-xs font-black tracking-[0.3em] text-white/20 uppercase">Carregando Logos Oficiais...</span>
          </div>
        ) : (
          matches.map((match, index) => (
            <MatchCard key={match.id} match={match} index={index} />
          ))
        )}
      </main>

      {/* Footer */}
      <footer className="mt-32 mb-20 text-white/20 text-[10px] uppercase tracking-[0.4em] font-bold text-center">
        Padrão Redflix / Premiere Style • 2026
      </footer>
    </div>
  );
}
