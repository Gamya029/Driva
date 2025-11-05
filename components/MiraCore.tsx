import React, { useRef, useEffect } from 'react';
import { MiraState } from '../types';

interface MiraCoreProps {
  state: MiraState;
  analyserNode: AnalyserNode | null;
}

const MiraCore: React.FC<MiraCoreProps> = ({ state, analyserNode }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameId = useRef<number>();

  const getPulseClass = () => {
    switch (state) {
      case MiraState.LISTENING:
        return 'animate-pulse border-blue-400';
      case MiraState.SPEAKING:
        return 'animate-pulse border-green-400';
      case MiraState.THINKING:
        return 'animate-pulse border-purple-400';
      default:
        return 'border-slate-600';
    }
  };
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyserNode) return;

    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) return;

    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    // FIX: Corrected a malformed multi-line const declaration that was causing a parser error.
    const WIDTH = canvas.width;
    const HEIGHT = canvas.height;
    const centerX = WIDTH / 2;
    const centerY = HEIGHT / 2;
    const radius = Math.min(WIDTH, HEIGHT) / 3;

    const draw = () => {
      animationFrameId.current = requestAnimationFrame(draw);
      analyserNode.getByteFrequencyData(dataArray);

      canvasCtx.clearRect(0, 0, WIDTH, HEIGHT);

      const barCount = 60;
      canvasCtx.lineWidth = 4;
      canvasCtx.lineCap = 'round';
      
      for (let i = 0; i < barCount; i++) {
        const barHeight = (dataArray[Math.floor(i * bufferLength / barCount)] / 255) * radius * 0.5;
        const angle = (i / barCount) * 2 * Math.PI;

        const startX = centerX + (radius - barHeight) * Math.cos(angle);
        const startY = centerY + (radius - barHeight) * Math.sin(angle);
        const endX = centerX + (radius + barHeight) * Math.cos(angle);
        const endY = centerY + (radius + barHeight) * Math.sin(angle);

        const gradient = canvasCtx.createLinearGradient(startX, startY, endX, endY);
        gradient.addColorStop(0, '#38bdf8');
        gradient.addColorStop(1, '#818cf8');

        canvasCtx.strokeStyle = state === MiraState.SPEAKING ? gradient : '#475569';
        
        canvasCtx.beginPath();
        canvasCtx.moveTo(startX, startY);
        canvasCtx.lineTo(endX, endY);
        canvasCtx.stroke();
      }
    };

    draw();

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [analyserNode, state]);

  return (
    <div className="relative w-64 h-64 flex items-center justify-center">
       <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" width="300" height="300" />
      <div
        className={`absolute w-full h-full rounded-full bg-slate-800/20 border-2 transition-all duration-300 ${getPulseClass()}`}
        style={{ animationDuration: state !== MiraState.IDLE ? '1.5s' : '0s' }}
      ></div>
      <div
        className={`absolute w-5/6 h-5/6 rounded-full bg-slate-900/30 border transition-all duration-300 ${getPulseClass()}`}
        style={{ animationDuration: state !== MiraState.IDLE ? '2s' : '0s', animationDelay: '0.2s' }}
      ></div>
      <div className="absolute w-2/4 h-2/4 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 shadow-2xl shadow-blue-500/50 flex flex-col items-center justify-center">
        <h2 className="text-3xl font-bold tracking-[0.3em] text-white/90">MIRA</h2>
      </div>
      <p className="absolute bottom-4 text-slate-400 capitalize tracking-widest">{state.toLowerCase()}</p>
    </div>
  );
};

export default MiraCore;
