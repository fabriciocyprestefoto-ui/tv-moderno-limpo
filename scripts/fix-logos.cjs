const fs = require('fs');
const path = require('path');

const channelsPath = path.resolve(__dirname, '..', 'public', 'data', 'channels.json');
const channels = JSON.parse(fs.readFileSync(channelsPath, 'utf-8'));

const logoReplacements = {
  'TV ESCOLA': 'https://img.onetv.plus/icones_channels/TV_ESCOLA.png',
  'REDE SECULO 21': 'https://img.onetv.plus/icones_channels/REDE_SECULO_21.png',
  'REDE SÉCULO 21': 'https://img.onetv.plus/icones_channels/REDE_SECULO_21.png',
  ZOOMOO: 'https://img.onetv.plus/icones_channels/ZOOMOO.png',
  'TV GIDEOES': 'https://img.onetv.plus/icones_channels/TV_GIDEOES.png',
  'GOLF CHANNEL': 'https://img.onetv.plus/icones_channels/GOLF_CHANNEL.png',
  '24H-O UNIVERSO': 'https://upload.wikimedia.org/wikipedia/commons/8/80/Universo_%28canal%29.png',
  HISTORY: 'https://img.onetv.plus/icones_channels/HISTORY.png',
  'CANAL BRASIL': 'https://img.onetv.plus/icones_channels/CANAL_BRASIL.png',
  TBC: 'https://img.onetv.plus/icones_channels/TBC.png',
  'REDE BRASIL': 'https://img.onetv.plus/icones_channels/REDE_BRASIL.png',
  'TV BRASIL': 'https://img.onetv.plus/icones_channels/TV_BRASIL.png',
  'CANAL SAÚDE': 'https://img.onetv.plus/icones_channels/CANAL_SAUDE.png',
  BRTVMAX: 'https://img.onetv.plus/icones_channels/BRTVMAX.png',
  'BM&C': 'https://img.onetv.plus/icones_channels/BMC.png',
};

let replaced = 0;

const fixedChannels = channels.map((channel) => {
  if (!channel.logo) return channel;

  const isBlocked =
    channel.logo.includes('encrypted-tbn0.gstatic.com') ||
    channel.logo.includes('googleusercontent.com') ||
    channel.logo.includes('blogger.googleusercontent.com');

  if (isBlocked) {
    for (const [name, logo] of Object.entries(logoReplacements)) {
      if (channel.name?.toUpperCase().includes(name)) {
        replaced++;
        console.log(
          `Replacing logo for ${channel.name}: ${channel.logo.substring(0, 50)}... -> ${logo}`
        );
        return { ...channel, logo };
      }
    }
  }

  return channel;
});

fs.writeFileSync(channelsPath, JSON.stringify(fixedChannels, null, 2));
console.log(`\nTotal replacements: ${replaced}`);
