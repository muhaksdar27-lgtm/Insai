import { useEffect, useRef } from 'react';

export function useAudioNotification() {
  const audioCtxRef = useRef<AudioContext | null>(null);

  const playChime = () => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      // Create oscillators for a pleasant dual-tone chime
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'sine';
      
      // Frequencies for a pleasant major 3rd ping
      osc1.frequency.setValueAtTime(880, ctx.currentTime); // A5
      osc2.frequency.setValueAtTime(1108.73, ctx.currentTime); // C#6

      // Envelope for a soft but clear ping
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + 1.5);
      osc2.stop(ctx.currentTime + 1.5);
    } catch (e) {
      console.error("Failed to play notification audio:", e);
    }
  };

  useEffect(() => {
    const handleAppUpdate = (e: any) => {
      if (e.detail?.type === 'SIGNAL_PUBLISHED') {
        playChime();
        // Also trigger a refetch so the UI shows the new signal instantly
        window.dispatchEvent(new CustomEvent('app-refetch'));
      }
    };
    
    window.addEventListener('app-update', handleAppUpdate);
    return () => window.removeEventListener('app-update', handleAppUpdate);
  }, []);
  
  return { playChime };
}
