export type FallbackChannelItem = {
  id: string;
  number: string;
  name: string;
  program: string;
  logo: string;
  video: string;
};

export type FallbackChannelCategory = {
  id: string;
  name: string;
  channels: FallbackChannelItem[];
};

export const FALLBACK_CHANNEL_CATEGORIES: FallbackChannelCategory[] = [
  {
    id: 'abertos',
    name: 'ABERTOS',
    channels: [
      {
        id: 'sbt',
        number: '4',
        name: 'SBT',
        program: 'Programa do Ratinho',
        logo: 'https://i.postimg.cc/7hpBRrwD/sbt1.png',
        video: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      },
      {
        id: 'record',
        number: '7',
        name: 'Record',
        program: 'A Fazenda',
        logo: 'https://i.postimg.cc/jdyjDqp6/record1.png',
        video: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
      },
      {
        id: 'bandtv',
        number: '13',
        name: 'Band',
        program: 'MasterChef',
        logo: 'https://i.postimg.cc/SKhL10tL/band.png',
        video: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      },
    ],
  },
  {
    id: 'esportes',
    name: 'ESPORTES',
    channels: [
      {
        id: 'bs1',
        number: '16',
        name: 'Band Sports FHD',
        program: 'Ao Vivo',
        logo: 'https://techzzi.site/logos/esportes/bandsports.png',
        video: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      },
      {
        id: 'espn1',
        number: '17',
        name: 'ESPN 1 HD',
        program: 'SportsCenter',
        logo: 'https://techzzi.site/logos/esportes/espn.png',
        video: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
      },
    ],
  },
];
