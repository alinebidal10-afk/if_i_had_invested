import { motion } from 'motion/react';
import { SPEEDS } from '../lib/usePlayback';

type Props = {
  speed: number;
  onSpeed: (s: number) => void;
  paceText: string;
  playing: boolean;
  onPlayPause: () => void;
  onReplay: () => void;
};

// Playback controls under the chart, at full strength: they are what the viewer reaches for most.
export default function SpeedBar({ speed, onSpeed, paceText, playing, onPlayPause, onReplay }: Props) {
  return (
    <div className="speedbar">
      {/* Both labels share one cell, so the button (and the row) keeps one width when Play turns into Pause. */}
      <button type="button" className="tbtn pp" onClick={onPlayPause} aria-label={playing ? 'Pause' : 'Play'}>
        <span className={playing ? 'off' : ''} aria-hidden="true">Play</span>
        <span className={playing ? '' : 'off'} aria-hidden="true">Pause</span>
      </button>
      <button type="button" className="tbtn" onClick={onReplay}>
        Replay
      </button>
      <div className="seg" role="group" aria-label="Playback speed">
        {SPEEDS.map((s) => (
          <button key={s} type="button" className={speed === s ? 'on' : ''} aria-pressed={speed === s} onClick={() => onSpeed(s)}>
            {speed === s && <motion.span layoutId="speed-indicator" className="ind" transition={{ type: 'spring', stiffness: 500, damping: 35 }} />}
            <span className="lbl">{s}×</span>
          </button>
        ))}
      </div>
      <span className="pace">{paceText}</span>
    </div>
  );
}
