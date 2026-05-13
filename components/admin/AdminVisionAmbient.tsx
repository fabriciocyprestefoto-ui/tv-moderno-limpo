import React, { useEffect, useRef } from 'react';

type Particle = {
  x: number;
  y: number;
  radius: number;
  speed: number;
  phase: number;
  alpha: number;
};

const PARTICLE_COUNT = 84;
const GRAPH_BAR_COUNT = 22;

function createParticle(width: number, height: number): Particle {
  return {
    x: Math.random() * width,
    y: Math.random() * height * 0.72,
    radius: 0.8 + Math.random() * 1.9,
    speed: 0.15 + Math.random() * 0.5,
    phase: Math.random() * Math.PI * 2,
    alpha: 0.18 + Math.random() * 0.64,
  };
}

const AdminVisionAmbient: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    let width = 0;
    let height = 0;
    let animationFrame = 0;
    let particles: Particle[] = [];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (particles.length !== PARTICLE_COUNT) {
        particles = Array.from({ length: PARTICLE_COUNT }, () => createParticle(width, height));
      }
    };

    const drawLandscape = (time: number) => {
      const layers = [
        {
          startY: height * 0.77,
          color: 'rgba(28, 4, 10, 0.92)',
          amplitude: 36,
          frequency: 2.8,
          speed: 0.22,
        },
        {
          startY: height * 0.84,
          color: 'rgba(8, 2, 4, 0.96)',
          amplitude: 24,
          frequency: 3.6,
          speed: 0.18,
        },
      ];

      layers.forEach((layer) => {
        context.beginPath();
        context.moveTo(0, height);
        context.lineTo(0, layer.startY);

        for (let x = 0; x <= width; x += 18) {
          const progress = x / Math.max(width, 1);
          const y =
            layer.startY -
            Math.sin(progress * Math.PI * layer.frequency + time * layer.speed) * layer.amplitude -
            Math.cos(progress * Math.PI * (layer.frequency * 0.6) + time * layer.speed * 1.4) *
              (layer.amplitude * 0.35);
          context.lineTo(x, y);
        }

        context.lineTo(width, height);
        context.closePath();
        context.fillStyle = layer.color;
        context.fill();
      });
    };

    const drawBars = (time: number) => {
      const startX = width * 0.41;
      const baseY = height * 0.89;
      const gap = 14;

      for (let index = 0; index < GRAPH_BAR_COUNT; index += 1) {
        const x = startX + index * gap;
        const activity =
          (Math.sin(time * 1.7 + index * 0.5) + 1) * 0.5 +
          (Math.cos(time * 0.9 + index * 0.22) + 1) * 0.2;
        const barHeight = 10 + activity * 42;

        const fill = context.createLinearGradient(x, baseY - barHeight, x, baseY + 20);
        fill.addColorStop(0, 'rgba(255, 80,  80,  0.88)');
        fill.addColorStop(0.55, 'rgba(180, 0,   0,   0.42)');
        fill.addColorStop(1, 'rgba(120, 0,   0,   0)');

        context.fillStyle = fill;
        context.beginPath();
        context.roundRect(x, baseY - barHeight, 8, barHeight, 8);
        context.fill();
      }
    };

    const drawWave = (time: number) => {
      context.beginPath();
      const startX = width * 0.38;
      const endX = width * 0.92;

      for (let x = startX; x <= endX; x += 12) {
        const progress = (x - startX) / Math.max(endX - startX, 1);
        const y =
          height * 0.76 +
          Math.sin(progress * 8.4 + time * 1.4) * 14 +
          Math.cos(progress * 10.8 + time * 0.68) * 6;
        if (x === startX) context.moveTo(x, y);
        else context.lineTo(x, y);
      }

      const stroke = context.createLinearGradient(startX, 0, endX, 0);
      stroke.addColorStop(0, 'rgba(255, 255, 255, 0)');
      stroke.addColorStop(0.2, 'rgba(255, 80,  80,  0.48)');
      stroke.addColorStop(0.55, 'rgba(220, 0,   0,   0.62)');
      stroke.addColorStop(0.78, 'rgba(160, 0,   60,  0.22)');
      stroke.addColorStop(1, 'rgba(255, 255, 255, 0)');

      context.strokeStyle = stroke;
      context.lineWidth = 2.2;
      context.shadowBlur = 30;
      context.shadowColor = 'rgba(220, 0, 0, 0.28)';
      context.stroke();
      context.shadowBlur = 0;
    };

    const drawParticles = (time: number) => {
      particles.forEach((particle) => {
        const alpha =
          particle.alpha *
          (0.65 + ((Math.sin(time * particle.speed + particle.phase) + 1) / 2) * 0.7);

        context.beginPath();
        context.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        context.shadowBlur = 10;
        context.shadowColor = `rgba(255, 255, 255, ${alpha * 0.3})`;
        context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        context.fill();
      });
      context.shadowBlur = 0;
    };

    const render = (timestamp: number) => {
      const time = timestamp * 0.001;

      context.clearRect(0, 0, width, height);

      const halo = context.createRadialGradient(
        width * 0.5,
        height * 0.28,
        0,
        width * 0.5,
        height * 0.28,
        width * 0.5
      );
      halo.addColorStop(0, 'rgba(200, 0,  0,   0.18)');
      halo.addColorStop(0.38, 'rgba(160, 0,  0,   0.12)');
      halo.addColorStop(0.68, 'rgba(100, 0,  40,  0.06)');
      halo.addColorStop(1, 'rgba(0,   0,  0,   0)');
      context.fillStyle = halo;
      context.fillRect(0, 0, width, height);

      drawLandscape(time);

      context.globalCompositeOperation = 'lighter';
      drawBars(time);
      drawWave(time);
      drawParticles(time);
      context.globalCompositeOperation = 'source-over';

      animationFrame = window.requestAnimationFrame(render);
    };

    resize();
    render(0);
    window.addEventListener('resize', resize);

    return () => {
      window.removeEventListener('resize', resize);
      window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  return (
    <div className="admin-vision__ambient" aria-hidden="true">
      <canvas ref={canvasRef} className="admin-vision__canvas" />
      <span className="admin-vision__orb admin-vision__orb--violet" />
      <span className="admin-vision__orb admin-vision__orb--blue" />
      <span className="admin-vision__orb admin-vision__orb--pink" />
      <span className="admin-vision__glow-grid" />
    </div>
  );
};

export default AdminVisionAmbient;
