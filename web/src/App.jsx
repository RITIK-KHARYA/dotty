import { useState, useRef, useEffect, useCallback } from "react";

const C = {
  bg: "#f5f7fb",
  panel: "#ffffff",
  surface: "#0b1120",
  surface2: "#111827",
  border: "#d9e2ec",
  softBorder: "#edf1f6",
  fg: "#111827",
  muted: "#65758b",
  dim: "#94a3b8",
  accent: "#0f766e",
  accentSoft: "#e6f5f2",
  warn: "#b45309",
  err: "#dc2626",
  code: "#d9f99d",
};

const isVideo = f => f?.type?.startsWith("video/");
const isImage = f => f?.type?.startsWith("image/");

function SliderControl({ label, min, max, step, value, onChange, compact = false }) {
  return (
    <label className="control">
      <span className="control-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={onChange}
        className={compact ? "range compact" : "range"}
      />
      <span className="control-value">{value}</span>
    </label>
  );
}

function ActionButton({ active = false, tone = "default", children, ...props }) {
  return (
    <button
      {...props}
      className={[
        "button",
        active ? "active" : "",
        tone === "primary" ? "primary" : "",
        props.disabled ? "disabled" : "",
      ].filter(Boolean).join(" ")}
    >
      {children}
    </button>
  );
}

function Toolbar({ children }) {
  return <div className="toolbar">{children}</div>;
}

function Workspace({ eyebrow, title, description, meta, children }) {
  return (
    <section className="workspace">
      <div className="workspace-head">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {meta && <span className="meta-pill">{meta}</span>}
      </div>
      {children}
    </section>
  );
}

function DropZone({
  inputRef,
  accept,
  onDrop,
  onChange,
  onClick,
  loading,
  preview,
  icon,
  title,
  note,
}) {
  return (
    <div
      onDrop={onDrop}
      onDragOver={e => e.preventDefault()}
      onClick={onClick}
      className={`drop-zone ${loading ? "loading" : ""}`}
      role="button"
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
    >
      <div className="drop-visual">
        {preview
          ? <img src={preview} alt="" />
          : <span>{icon}</span>}
      </div>
      <div>
        <strong>{title}</strong>
        <p>{note}</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden-input"
        onChange={onChange}
      />
    </div>
  );
}

function StatusLine({ tone = "muted", children }) {
  return <div className={`status ${tone}`}>{children}</div>;
}

function SkyTab() {
  const [ascii, setAscii]     = useState("");
  const [mode, setMode]       = useState("night");
  const [scale, setScale]     = useState(4);
  const [rows, setRows]       = useState(24);
  const [loading, setLoading] = useState(false);

  const generate = async (overrideSeed) => {
    setLoading(true);
    try {
      const res = await fetch("/api/sky", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ width: 100, height: rows, seed: overrideSeed ?? 0, mode, scale }),
      });
      const d = await res.json();
      setAscii(d.ascii);
    } finally { setLoading(false); }
  };

  useEffect(() => { generate(0); }, []);

  return (
    <Workspace
      eyebrow="Procedural generator"
      title="Sky Generator"
      description="Create reproducible ASCII sky fields and tune their density before rendering."
      meta={`${rows} rows`}
    >
      <Toolbar>
        <div className="segmented" aria-label="Sky mode">
          {["day","dusk","night"].map(m => (
            <button key={m} onClick={() => setMode(m)} className={mode === m ? "selected" : ""}>
              {m}
            </button>
          ))}
        </div>
        <SliderControl label="Scale" min={1} max={10} step={0.5} value={scale}
          onChange={e => setScale(+e.target.value)} />
        <SliderControl label="Rows" min={8} max={50} step={2} value={rows}
          onChange={e => setRows(+e.target.value)} compact />
        <div className="toolbar-spacer" />
        <ActionButton onClick={() => generate(Math.floor(Math.random()*999999))}>
          Random seed
        </ActionButton>
        <ActionButton onClick={() => generate()} active tone="primary" disabled={loading}>
          {loading ? "Generating" : "Generate"}
        </ActionButton>
      </Toolbar>
      <pre style={preStyle(loading)}>{ascii || "Press generate to create a sky."}</pre>
    </Workspace>
  );
}

function ImageTab() {
  const [ascii, setAscii]     = useState("");
  const [cols, setCols]       = useState(120);
  const [rows, setRows]       = useState(40);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState("");
  const [preview, setPreview] = useState(null);
  const inputRef = useRef();

  const convert = async (file) => {
    if (!file || !isImage(file)) return;
    setErr(""); setLoading(true);
    setPreview(URL.createObjectURL(file));
    try {
      const fd = new FormData();
      fd.append("image", file);
      fd.append("cols", cols);
      fd.append("rows", rows);
      const res = await fetch("/api/convert/image", { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());
      const d = await res.json();
      setAscii(d.ascii);
    } catch(e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  const onDrop = useCallback(e => {
    e.preventDefault();
    convert(e.dataTransfer.files[0]);
  }, [cols, rows]);

  return (
    <Workspace
      eyebrow="Still conversion"
      title="Image to ASCII"
      description="Upload an image, choose the terminal dimensions, and convert it into clean text art."
      meta={`${cols} x ${rows}`}
    >
      <Toolbar>
        <SliderControl label="Columns" min={40} max={200} step={10} value={cols}
          onChange={e => setCols(+e.target.value)} />
        <SliderControl label="Rows" min={10} max={80} step={5} value={rows}
          onChange={e => setRows(+e.target.value)} />
      </Toolbar>

      <DropZone
        inputRef={inputRef}
        accept="image/*"
        onDrop={onDrop}
        onClick={() => inputRef.current.click()}
        onChange={e => convert(e.target.files[0])}
        loading={loading}
        preview={preview}
        icon="IMG"
        title={loading ? "Converting image" : "Drop image here or click to upload"}
        note="JPG, PNG, and GIF files are supported."
      />

      {err && <StatusLine tone="error">Error: {err}</StatusLine>}
      {ascii && <pre style={preStyle(loading)}>{ascii}</pre>}
    </Workspace>
  );
}

function VideoTab() {
  const [frames, setFrames]     = useState([]);
  const [fps, setFps]           = useState(8);
  const [cols, setCols]         = useState(80);
  const [rows, setRows]         = useState(24);
  const [loading, setLoading]   = useState(false);
  const [playing, setPlaying]   = useState(false);
  const [frameIdx, setFrameIdx] = useState(0);
  const [err, setErr]           = useState("");
  const [progress, setProgress] = useState("");
  const inputRef = useRef();
  const timerRef = useRef();

  const convert = async (file) => {
    if (!file || !isVideo(file)) return;
    setErr(""); setFrames([]); setPlaying(false); setFrameIdx(0);
    setLoading(true); setProgress("uploading...");
    try {
      const fd = new FormData();
      fd.append("video", file);
      fd.append("cols", cols);
      fd.append("rows", rows);
      fd.append("fps", fps);
      setProgress("extracting frames via ffmpeg...");
      const res = await fetch("/api/convert/video", { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());
      setProgress("rendering ASCII...");
      const d = await res.json();
      setFrames(d.frames);
      setProgress(`${d.frames.length} frames ready`);
    } catch(e) { setErr(e.message); setProgress(""); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (playing && frames.length > 0) {
      timerRef.current = setInterval(() => {
        setFrameIdx(i => (i + 1) % frames.length);
      }, 1000 / fps);
    } else { clearInterval(timerRef.current); }
    return () => clearInterval(timerRef.current);
  }, [playing, frames, fps]);

  const onDrop = useCallback(e => {
    e.preventDefault();
    convert(e.dataTransfer.files[0]);
  }, [cols, rows, fps]);

  return (
    <Workspace
      eyebrow="Motion conversion"
      title="Video to ASCII"
      description="Extract frames from a video, render them as ASCII, and preview the animation."
      meta={frames.length ? `${frames.length} frames` : `${fps} fps`}
    >
      <Toolbar>
        <SliderControl label="Columns" min={40} max={120} step={10} value={cols}
          onChange={e => setCols(+e.target.value)} compact />
        <SliderControl label="Rows" min={10} max={40} step={2} value={rows}
          onChange={e => setRows(+e.target.value)} compact />
        <SliderControl label="FPS" min={2} max={24} step={2} value={fps}
          onChange={e => setFps(+e.target.value)} compact />
      </Toolbar>

      {frames.length === 0 && (
        <DropZone
          inputRef={inputRef}
          accept="video/*"
          onDrop={onDrop}
          onClick={() => !loading && inputRef.current.click()}
          onChange={e => convert(e.target.files[0])}
          loading={loading}
          icon="VID"
          title={loading ? progress : "Drop video here or click to upload"}
          note="MP4, WebM, and MOV files are supported. Keep clips short for faster conversion."
        />
      )}

      {err && (
        <StatusLine tone="error">
          Error: {err}
          {err.includes("ffmpeg") && <>
            {" "}
            <a href="https://ffmpeg.org/download.html" target="_blank" rel="noreferrer">
              Install ffmpeg
            </a>
            {" "}and add it to PATH.
          </>}
        </StatusLine>
      )}

      {frames.length > 0 && (
        <div className="player">
          <div className="player-controls">
            <ActionButton onClick={() => setPlaying(p => !p)} active={playing} tone="primary">
              {playing ? "Pause" : "Play"}
            </ActionButton>
            <ActionButton onClick={() => { setFrames([]); setPlaying(false); setFrameIdx(0); setProgress(""); }}>
              Clear
            </ActionButton>
            <span>
              Frame {frameIdx + 1} / {frames.length} | {fps} fps
            </span>
          </div>
          <input type="range" min={0} max={frames.length - 1} value={frameIdx}
            onChange={e => { setPlaying(false); setFrameIdx(+e.target.value); }}
            className="range full"
          />
          <pre style={preStyle(false)}>{frames[frameIdx]}</pre>
        </div>
      )}
    </Workspace>
  );
}

const preStyle = (faded) => ({
  margin: 0,
  minHeight: 260,
  fontSize: 13,
  lineHeight: 1.28,
  color: C.code,
  whiteSpace: "pre",
  overflow: "auto",
  opacity: faded ? 0.42 : 1,
  transition: "opacity .2s ease",
  background: C.surface,
  padding: 20,
  borderRadius: 8,
  border: `1px solid ${C.surface2}`,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,.04), 0 20px 45px rgba(15,23,42,.08)",
  fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
});

const TABS = [
  { id: "image", label: "Image", kicker: "Convert stills" },
  { id: "video", label: "Video", kicker: "Animate frames" },
  { id: "sky",   label: "Sky",   kicker: "Generate fields" },
];

const globalStyles = `
  * { box-sizing: border-box; }
  body { margin: 0; background: ${C.bg}; }
  button, input { font: inherit; }
  button:focus { outline: none; }
  button:focus-visible, .drop-zone:focus-visible {
    outline: 2px solid rgba(15,118,110,.35);
    outline-offset: 2px;
  }
  .app {
    min-height: 100vh;
    background:
      linear-gradient(180deg, rgba(255,255,255,.9), rgba(245,247,251,.96) 36%, ${C.bg}),
      ${C.bg};
    color: ${C.fg};
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    display: grid;
    grid-template-columns: 280px minmax(0, 1fr);
  }
  .sidebar {
    min-height: 100vh;
    padding: 28px 20px;
    border-right: 1px solid ${C.border};
    background: rgba(255,255,255,.72);
    backdrop-filter: blur(16px);
    display: flex;
    flex-direction: column;
    gap: 28px;
  }
  .brand {
    display: flex;
    gap: 12px;
    align-items: center;
  }
  .brand-mark {
    width: 42px;
    height: 42px;
    border-radius: 8px;
    display: grid;
    place-items: center;
    background: ${C.surface};
    color: ${C.code};
    font-family: Consolas, monospace;
    font-weight: 700;
    letter-spacing: 0;
  }
  .brand strong {
    display: block;
    font-size: 15px;
    letter-spacing: 0;
  }
  .brand span, .sidebar-note, .workspace-head p, .drop-zone p {
    color: ${C.muted};
  }
  .brand span {
    display: block;
    margin-top: 2px;
    font-size: 12px;
  }
  .nav-list {
    display: grid;
    gap: 8px;
  }
  .nav-item {
    width: 100%;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: ${C.fg};
    padding: 12px;
    text-align: left;
    cursor: pointer;
    transition: background .18s ease, border-color .18s ease, transform .18s ease;
  }
  .nav-item:hover {
    background: ${C.panel};
    border-color: ${C.softBorder};
  }
  .nav-item.active {
    background: ${C.panel};
    border-color: ${C.border};
    box-shadow: 0 14px 32px rgba(15,23,42,.07);
  }
  .nav-item strong {
    display: block;
    font-size: 14px;
  }
  .nav-item span {
    display: block;
    margin-top: 3px;
    color: ${C.muted};
    font-size: 12px;
  }
  .sidebar-note {
    margin-top: auto;
    padding-top: 18px;
    border-top: 1px solid ${C.softBorder};
    font-size: 12px;
    line-height: 1.6;
  }
  .main {
    min-width: 0;
    padding: 28px;
  }
  .workspace {
    max-width: 1120px;
    display: grid;
    gap: 18px;
  }
  .workspace-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
  }
  .eyebrow {
    margin: 0 0 7px;
    color: ${C.accent};
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .08em;
  }
  h1 {
    margin: 0;
    font-size: clamp(28px, 4vw, 44px);
    line-height: 1.05;
    letter-spacing: 0;
  }
  .workspace-head p:not(.eyebrow) {
    max-width: 650px;
    margin: 12px 0 0;
    font-size: 15px;
    line-height: 1.6;
  }
  .meta-pill {
    flex: 0 0 auto;
    border: 1px solid ${C.border};
    border-radius: 999px;
    padding: 7px 11px;
    background: ${C.panel};
    color: ${C.muted};
    font-size: 12px;
    font-weight: 700;
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    padding: 14px;
    background: ${C.panel};
    border: 1px solid ${C.border};
    border-radius: 8px;
    box-shadow: 0 16px 38px rgba(15,23,42,.06);
  }
  .toolbar-spacer { flex: 1 1 auto; }
  .control {
    display: flex;
    align-items: center;
    gap: 9px;
    min-height: 34px;
  }
  .control-label {
    min-width: 62px;
    color: ${C.muted};
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .06em;
  }
  .control-value {
    min-width: 34px;
    color: ${C.fg};
    font-size: 13px;
    font-weight: 700;
  }
  .range {
    width: 128px;
    accent-color: ${C.accent};
  }
  .range.compact { width: 94px; }
  .range.full { width: 100%; }
  .button {
    min-height: 34px;
    border: 1px solid ${C.border};
    border-radius: 7px;
    padding: 0 14px;
    background: ${C.panel};
    color: ${C.fg};
    cursor: pointer;
    font-size: 13px;
    font-weight: 700;
    transition: background .18s ease, border-color .18s ease, color .18s ease, transform .18s ease;
  }
  .button:hover {
    border-color: ${C.accent};
    color: ${C.accent};
  }
  .button.primary, .button.active {
    background: ${C.accent};
    border-color: ${C.accent};
    color: white;
  }
  .button.disabled {
    cursor: wait;
    opacity: .62;
  }
  .segmented {
    display: inline-flex;
    padding: 3px;
    border: 1px solid ${C.border};
    border-radius: 8px;
    background: ${C.bg};
  }
  .segmented button {
    min-width: 70px;
    min-height: 30px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: ${C.muted};
    cursor: pointer;
    font-size: 13px;
    font-weight: 700;
    text-transform: capitalize;
  }
  .segmented button.selected {
    background: ${C.panel};
    color: ${C.accent};
    box-shadow: 0 7px 18px rgba(15,23,42,.08);
  }
  .drop-zone {
    min-height: 150px;
    border: 1px dashed ${C.border};
    border-radius: 8px;
    padding: 24px;
    cursor: pointer;
    background: ${C.panel};
    display: flex;
    align-items: center;
    gap: 18px;
    transition: border-color .18s ease, background .18s ease, box-shadow .18s ease;
  }
  .drop-zone:hover, .drop-zone:focus-visible {
    border-color: ${C.accent};
    background: ${C.accentSoft};
    box-shadow: 0 18px 40px rgba(15,23,42,.07);
  }
  .drop-zone.loading { cursor: wait; }
  .drop-visual {
    width: 76px;
    height: 76px;
    flex: 0 0 76px;
    border-radius: 8px;
    overflow: hidden;
    display: grid;
    place-items: center;
    background: ${C.bg};
    border: 1px solid ${C.softBorder};
    color: ${C.accent};
    font-family: Consolas, monospace;
    font-weight: 800;
  }
  .drop-visual img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .drop-zone strong {
    display: block;
    font-size: 15px;
  }
  .drop-zone p {
    margin: 5px 0 0;
    font-size: 13px;
    line-height: 1.45;
  }
  .hidden-input { display: none; }
  .status {
    padding: 11px 13px;
    border-radius: 8px;
    font-size: 13px;
    line-height: 1.5;
  }
  .status.error {
    color: ${C.err};
    background: #fef2f2;
    border: 1px solid #fecaca;
  }
  .status a {
    color: ${C.warn};
    font-weight: 700;
  }
  .player {
    display: grid;
    gap: 14px;
  }
  .player-controls {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .player-controls span {
    color: ${C.muted};
    font-size: 13px;
    font-weight: 700;
  }
  @media (max-width: 820px) {
    .app {
      grid-template-columns: 1fr;
    }
    .sidebar {
      min-height: auto;
      padding: 18px;
      border-right: 0;
      border-bottom: 1px solid ${C.border};
      gap: 16px;
    }
    .nav-list {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .sidebar-note {
      display: none;
    }
    .main {
      padding: 20px 16px;
    }
    .workspace-head {
      display: grid;
    }
    .meta-pill {
      width: max-content;
    }
    .toolbar {
      align-items: stretch;
    }
    .control {
      width: 100%;
      justify-content: space-between;
    }
    .range, .range.compact {
      width: min(44vw, 180px);
    }
    .drop-zone {
      align-items: flex-start;
      padding: 18px;
    }
  }
  @media (max-width: 520px) {
    .nav-list {
      grid-template-columns: 1fr;
    }
    .drop-zone {
      display: grid;
    }
  }
`;

export default function App() {
  const [tab, setTab] = useState("image");
  const currentTab = TABS.find(t => t.id === tab);

  return (
    <div className="app">
      <style>{globalStyles}</style>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">A/</div>
          <div>
            <strong>ASCII Gen</strong>
            <span>Image, video, and sky renderer</span>
          </div>
        </div>

        <nav className="nav-list" aria-label="Tools">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`nav-item ${tab === t.id ? "active" : ""}`}
              aria-current={tab === t.id ? "page" : undefined}
            >
              <strong>{t.label}</strong>
              <span>{t.kicker}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-note">
          Current workspace: <strong>{currentTab.label}</strong><br />
          Video conversion requires ffmpeg available in PATH.
        </div>
      </aside>

      <main className="main">
        {tab === "image" && <ImageTab />}
        {tab === "video" && <VideoTab />}
        {tab === "sky"   && <SkyTab />}
      </main>
    </div>
  );
}
