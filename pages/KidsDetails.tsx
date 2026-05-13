import React from 'react';
import { Media } from '../types';
import Details from './Details';

interface KidsDetailsProps {
  media: Media;
  onPlay: (media?: Media) => void;
  onBack: () => void;
  onSelectMedia?: (media: Media) => void;
}

const KidsDetails: React.FC<KidsDetailsProps> = (props) => {
  return <Details {...props} />;
};

export default React.memo(KidsDetails);
