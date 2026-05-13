import React from 'react';

/**
 * VinhetaPreloader desativado.
 * O preload antigo criava um <video> invisivel no boot global, e o proprio projeto
 * ja registra que esse padrao causa GPU Surface Crash na Android TV/WebView.
 * A vinheta continua sendo carregada apenas no Player, no momento correto.
 */
const VinhetaPreloader: React.FC = () => null;

export default VinhetaPreloader;
