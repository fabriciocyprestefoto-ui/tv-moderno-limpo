import fs from 'fs';
import path from 'path';

const file = 'c:/Users/Fabricio/Desktop/tv-moderno-limpo/pages/Home.tsx';
let content = fs.readFileSync(file, 'utf8');

// I'll just restore the top imports of Home.tsx completely
content = content.replace(
`import { useNavigate } from 'react-router-dom';
import { useSpatialNav } from '../hooks/useSpatialNavigation';

const LazyRow: React.FC<{ children: React.ReactNode; estimatedHeight?: number }> = ({`,
`import { useNavigate } from 'react-router-dom';
import { useSpatialNav } from '../hooks/useSpatialNavigation';
import { isTVBox } from '../utils/tvBoxDetector';

/**
 * LazyRow — monta o conteúdo apenas quando a linha está próxima do viewport.
 * Reduz o número de MediaCard nodes no DOM em ~70% na TV Box.
 * TV Box usa margem maior (1200px) para pré-renderizar antes do D-pad chegar.
 */
const LAZY_ROW_MARGIN = isTVBox() ? '1200px 0px' : '600px 0px';

const LazyRow: React.FC<{ children: React.ReactNode; estimatedHeight?: number }> = ({`);

fs.writeFileSync(file, content, 'utf8');
console.log('Fixed Home.tsx top imports');
