import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_OPTIONS, loadOptions, saveOptions, type ComponentCopOptions } from '../../shared/options';

const LABEL: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: '#e0e0e0', marginBottom: 4 };
const HINT: React.CSSProperties = { fontSize: 11, color: '#8b8da0', marginBottom: 8 };
const INPUT: React.CSSProperties = {
  width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #333348',
  background: '#262637', color: '#e0e0e0', fontSize: 13, fontFamily: 'inherit', outline: 'none',
  boxSizing: 'border-box',
};
const SECTION: React.CSSProperties = { marginBottom: 20, padding: '14px 16px', background: '#262637', borderRadius: 8, border: '1px solid #333348' };

export function OptionsPage() {
  const [opts, setOpts] = useState<ComponentCopOptions>(DEFAULT_OPTIONS);
  const [saved, setSaved] = useState(false);
  const [excludeText, setExcludeText] = useState('');
  const [skipText, setSkipText] = useState('');

  useEffect(() => {
    loadOptions().then((loaded) => {
      setOpts(loaded);
      setExcludeText(loaded.excludePatterns.join('\n'));
      setSkipText(loaded.skipComponents.join('\n'));
    });
  }, []);

  const handleSave = useCallback(async () => {
    const updated: ComponentCopOptions = {
      ...opts,
      excludePatterns: excludeText.split('\n').map((s) => s.trim()).filter(Boolean),
      skipComponents: skipText.split('\n').map((s) => s.trim()).filter(Boolean),
    };
    await saveOptions(updated);
    setOpts(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [opts, excludeText, skipText]);

  const handleReset = useCallback(async () => {
    await saveOptions(DEFAULT_OPTIONS);
    setOpts(DEFAULT_OPTIONS);
    setExcludeText(DEFAULT_OPTIONS.excludePatterns.join('\n'));
    setSkipText(DEFAULT_OPTIONS.skipComponents.join('\n'));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, []);

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '24px 16px', fontFamily: "'Inter', system-ui, sans-serif", background: '#1e1e2e', minHeight: '100vh', color: '#e0e0e0' }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, color: '#818cf8', marginBottom: 4 }}>Component Cop</h1>
      <p style={{ fontSize: 12, color: '#8b8da0', marginBottom: 24 }}>Configure scanning behavior, thresholds, and exclusions.</p>

      {/* Similarity */}
      <div style={SECTION}>
        <label style={LABEL}>Similarity Threshold</label>
        <p style={HINT}>Components scoring above this are grouped as variants (0.0 — 1.0). Default: 0.7</p>
        <input type="number" min={0} max={1} step={0.05} value={opts.similarityThreshold}
          onChange={(e) => setOpts({ ...opts, similarityThreshold: Number(e.target.value) })}
          style={INPUT} />
      </div>

      {/* Color distance */}
      <div style={SECTION}>
        <label style={LABEL}>Color Distance Threshold (CIE76)</label>
        <p style={HINT}>Colors within this distance are flagged as near-duplicates. Default: 15</p>
        <input type="number" min={1} max={50} step={1} value={opts.colorDistanceThreshold}
          onChange={(e) => setOpts({ ...opts, colorDistanceThreshold: Number(e.target.value) })}
          style={INPUT} />
      </div>

      {/* Crawl settings */}
      <div style={SECTION}>
        <label style={LABEL}>Max Crawl Pages</label>
        <p style={HINT}>Maximum pages to visit during a site crawl. Default: 100</p>
        <input type="number" min={1} max={1000} step={1} value={opts.maxCrawlPages}
          onChange={(e) => setOpts({ ...opts, maxCrawlPages: Number(e.target.value) })}
          style={INPUT} />

        <label style={{ ...LABEL, marginTop: 12 }}>Crawl Delay (ms)</label>
        <p style={HINT}>Wait between page loads during crawl. Default: 1000</p>
        <input type="number" min={200} max={10000} step={100} value={opts.crawlDelayMs}
          onChange={(e) => setOpts({ ...opts, crawlDelayMs: Number(e.target.value) })}
          style={INPUT} />
      </div>

      {/* Exclude patterns */}
      <div style={SECTION}>
        <label style={LABEL}>Exclude URL Patterns</label>
        <p style={HINT}>One glob pattern per line. Matched URLs are skipped during crawl.</p>
        <textarea value={excludeText} onChange={(e) => setExcludeText(e.target.value)}
          rows={5} style={{ ...INPUT, resize: 'vertical', fontFamily: "'SF Mono', monospace", fontSize: 11 }} />
      </div>

      {/* Skip components */}
      <div style={SECTION}>
        <label style={LABEL}>Skip Component Names</label>
        <p style={HINT}>One component name per line. These are excluded from scanning (in addition to built-in skips like Fragment, Suspense, etc.).</p>
        <textarea value={skipText} onChange={(e) => setSkipText(e.target.value)}
          rows={4} style={{ ...INPUT, resize: 'vertical', fontFamily: "'SF Mono', monospace", fontSize: 11 }} />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={handleSave} style={{
          padding: '8px 20px', borderRadius: 6, border: 'none', cursor: 'pointer',
          background: '#818cf8', color: '#fff', fontWeight: 600, fontSize: 13, fontFamily: 'inherit',
        }}>
          Save
        </button>
        <button onClick={handleReset} style={{
          padding: '8px 20px', borderRadius: 6, border: '1px solid #333348', cursor: 'pointer',
          background: 'transparent', color: '#8b8da0', fontWeight: 600, fontSize: 13, fontFamily: 'inherit',
        }}>
          Reset to Defaults
        </button>
        {saved && <span style={{ fontSize: 12, color: '#34d399', fontWeight: 600 }}>Saved</span>}
      </div>

      {/* Keyboard shortcuts info */}
      <div style={{ ...SECTION, marginTop: 24 }}>
        <label style={LABEL}>Keyboard Shortcuts</label>
        <p style={HINT}>Configure in chrome://extensions/shortcuts</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Scan current page</span>
            <kbd style={{ padding: '2px 8px', borderRadius: 4, background: '#333348', color: '#818cf8', fontSize: 11, fontFamily: 'monospace' }}>Cmd+Shift+S</kbd>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Toggle element picker</span>
            <kbd style={{ padding: '2px 8px', borderRadius: 4, background: '#333348', color: '#818cf8', fontSize: 11, fontFamily: 'monospace' }}>Cmd+Shift+P</kbd>
          </div>
        </div>
      </div>
    </div>
  );
}
