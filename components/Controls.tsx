import type { Unit } from './LiveChart';

type Props = {
  unit: Unit;
  onUnit: (u: Unit) => void;
  onChange: () => void;
  onShare: () => void;
  sharePop: React.ReactNode;
  note: string;
};

const ShareGlyph = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 10V2M5 5l3-3 3 3M3 8v5h10V8" />
  </svg>
);

// The bar that fades in once the graph is up.
export default function Controls({ unit, onUnit, onChange, onShare, sharePop, note }: Props) {
  return (
    <div className="controls">
      <div className="buttons">
        <button className={unit === 'value' ? 'on' : ''} onClick={() => onUnit('value')}>
          Value
        </button>
        <button className={unit === 'pct' ? 'on' : ''} onClick={() => onUnit('pct')}>
          % change
        </button>
        <button onClick={onChange}>Change</button>
        <span className="sharewrap">
          <button type="button" className="share" onClick={onShare} aria-haspopup="dialog">
            <ShareGlyph /> Share
          </button>
          {sharePop}
        </span>
      </div>
      <p className="note">{note}</p>
    </div>
  );
}
