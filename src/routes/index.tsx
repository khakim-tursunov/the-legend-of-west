import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import wildWestBg from "@/assets/wild-west-bg.jpg";
import westernTheme from "@/assets/western-theme.mp3.asset.json";
import gunshotSfx from "@/assets/gunshot.mp3.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Wild West Showdown — Target Shooter" },
      { name: "description", content: "Fast-paced cowboy shooting gallery. Draw your gun and shoot outlaws, bottles, and badges before time runs out." },
      { property: "og:title", content: "Wild West Showdown" },
      { property: "og:description", content: "Fast-paced cowboy shooting gallery. Draw your gun and shoot outlaws, bottles, and badges before time runs out." },
    ],
  }),
  component: Game,
});

type Phase = "start" | "playing" | "over";
type TargetKind = "outlaw" | "bottle" | "badge";
type Target = {
  id: number;
  kind: TargetKind;
  x: number; // %
  y: number; // %
  born: number;
  ttl: number;
};
type Particle = {
  id: number;
  x: number;
  y: number;
  kind: "hit" | "miss";
  text?: string;
};

const KINDS: { kind: TargetKind; emoji: string; points: number }[] = [
  { kind: "outlaw", emoji: "🤠", points: 1 },
  { kind: "bottle", emoji: "🍾", points: 2 },
  { kind: "badge", emoji: "🌟", points: 3 },
];

const GAME_DURATION = 60;
const TARGET_TTL = 1800;
const SPAWN_INTERVAL = 700;
const COMBO_WINDOW = 1200;

function rankFor(score: number, acc: number) {
  if (score >= 60 && acc >= 0.8) return "Legend of the West";
  if (score >= 40) return "Sheriff";
  if (score >= 20) return "Bounty Hunter";
  if (score >= 10) return "Deputy";
  return "Greenhorn";
}

function Game() {
  const [phase, setPhase] = useState<Phase>("start");
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [targets, setTargets] = useState<Target[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [combo, setCombo] = useState(0);
  const [hits, setHits] = useState(0);
  const [shots, setShots] = useState(0);
  const [shake, setShake] = useState(0);
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);

  const lastHitRef = useRef(0);
  const idRef = useRef(1);
  const arenaRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<{ tick?: number; spawn?: number; cull?: number }>({});
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const gunshotPoolRef = useRef<HTMLAudioElement[]>([]);
  const gunshotIdxRef = useRef(0);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem("wws_high") : null;
    if (stored) setHighScore(parseInt(stored, 10) || 0);
  }, []);

  const clearTimers = () => {
    const t = timersRef.current;
    if (t.tick) window.clearInterval(t.tick);
    if (t.spawn) window.clearInterval(t.spawn);
    if (t.cull) window.clearInterval(t.cull);
    timersRef.current = {};
  };

  const endGame = useCallback(() => {
    clearTimers();
    setTargets([]);
    setPhase("over");
    setScore((s) => {
      setHighScore((hs) => {
        const next = Math.max(hs, s);
        if (typeof window !== "undefined") window.localStorage.setItem("wws_high", String(next));
        return next;
      });
      return s;
    });
  }, []);

  const runTimers = () => {
    timersRef.current.tick = window.setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          endGame();
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    timersRef.current.spawn = window.setInterval(() => {
      setTargets((cur) => {
        if (cur.length >= 5) return cur;
        const kind = KINDS[Math.floor(Math.random() * KINDS.length)].kind;
        return [
          ...cur,
          {
            id: idRef.current++,
            kind,
            x: 8 + Math.random() * 84,
            y: 15 + Math.random() * 75,
            born: Date.now(),
            ttl: TARGET_TTL,
          },
        ];
      });
    }, SPAWN_INTERVAL);

    timersRef.current.cull = window.setInterval(() => {
      const now = Date.now();
      setTargets((cur) => cur.filter((t) => now - t.born < t.ttl));
    }, 100);
  };

  const startGame = () => {
    clearTimers();
    setScore(0);
    setTimeLeft(GAME_DURATION);
    setTargets([]);
    setParticles([]);
    setCombo(0);
    setHits(0);
    setShots(0);
    setPaused(false);
    setPhase("playing");
    lastHitRef.current = 0;
    startMusic();
    runTimers();
  };

  const pauseGame = () => {
    if (phase !== "playing" || paused) return;
    setPaused(true);
    clearTimers();
    musicRef.current?.pause();
  };

  const resumeGame = () => {
    if (phase !== "playing" || !paused) return;
    setPaused(false);
    lastHitRef.current = 0;
    if (!muted) musicRef.current?.play().catch(() => {});
    runTimers();
  };

  useEffect(() => () => { clearTimers(); stopMusic(); }, []);

  const startMusic = () => {
    if (!musicRef.current) {
      const a = new Audio(westernTheme.url);
      a.loop = true;
      a.volume = 0.35;
      musicRef.current = a;
    }
    musicRef.current.muted = muted;
    musicRef.current.currentTime = 0;
    musicRef.current.play().catch(() => {});
  };

  const stopMusic = () => {
    if (musicRef.current) {
      musicRef.current.pause();
      musicRef.current.currentTime = 0;
    }
  };

  const toggleMute = () => {
    setMuted((m) => {
      const next = !m;
      if (musicRef.current) musicRef.current.muted = next;
      return next;
    });
  };

  const playGunshot = () => {
    if (muted) return;
    // Pool of preloaded gunshot audio elements for rapid-fire playback
    if (gunshotPoolRef.current.length === 0) {
      for (let i = 0; i < 4; i++) {
        const a = new Audio(gunshotSfx.url);
        a.volume = 0.7;
        gunshotPoolRef.current.push(a);
      }
    }
    const pool = gunshotPoolRef.current;
    const a = pool[gunshotIdxRef.current % pool.length];
    gunshotIdxRef.current++;
    try { a.currentTime = 0; a.play().catch(() => {}); } catch { /* noop */ }
  };

  const addParticle = (x: number, y: number, kind: "hit" | "miss", text?: string) => {
    const id = idRef.current++;
    setParticles((p) => [...p, { id, x, y, kind, text }]);
    window.setTimeout(() => {
      setParticles((p) => p.filter((pp) => pp.id !== id));
    }, 700);
  };

  const hitTarget = (e: React.MouseEvent, target: Target) => {
    e.stopPropagation();
    if (phase !== "playing" || paused) return;
    playGunshot();
    const rect = arenaRef.current?.getBoundingClientRect();
    const x = rect ? e.clientX - rect.left : 0;
    const y = rect ? e.clientY - rect.top : 0;

    const now = Date.now();
    const inCombo = now - lastHitRef.current < COMBO_WINDOW;
    const newCombo = inCombo ? combo + 1 : 1;
    lastHitRef.current = now;

    const base = KINDS.find((k) => k.kind === target.kind)!.points;
    const multiplier = Math.min(5, Math.ceil(newCombo / 3));
    const gained = base * multiplier;

    setCombo(newCombo);
    setScore((s) => s + gained);
    setHits((h) => h + 1);
    setShots((s) => s + 1);
    setTargets((cur) => cur.filter((t) => t.id !== target.id));
    addParticle(x, y, "hit", `+${gained}${multiplier > 1 ? ` x${multiplier}` : ""}`);
    setShake(Date.now());
  };

  const missClick = (e: React.MouseEvent) => {
    if (phase !== "playing" || paused) return;
    const rect = arenaRef.current?.getBoundingClientRect();
    const x = rect ? e.clientX - rect.left : 0;
    const y = rect ? e.clientY - rect.top : 0;
    playGunshot();
    setCombo(0);
    setShots((s) => s + 1);
    setTimeLeft((t) => Math.max(0, t - 1));
    addParticle(x, y, "miss", "MISS");
    lastHitRef.current = 0;
  };

  const accuracy = shots > 0 ? hits / shots : 0;

  return (
    <div
      className="min-h-[100dvh] w-full flex items-center justify-center p-2 sm:p-4"
      style={{
        background:
          "radial-gradient(ellipse at top, #bae6fd 0%, #fde68a 45%, #fdba74 80%, #f59e42 100%)",
        fontFamily: "'Rye', 'Georgia', serif",
        touchAction: "manipulation",
        WebkitUserSelect: "none",
        userSelect: "none",
      }}
    >
      <link href="https://fonts.googleapis.com/css2?family=Rye&family=Special+Elite&display=swap" rel="stylesheet" />

      <div
        className="relative w-full max-w-5xl rounded-2xl sm:rounded-3xl overflow-hidden border-4 sm:border-[6px] border-amber-950 shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
        style={{
          aspectRatio: "16 / 10",
          maxHeight: "calc(100dvh - 1rem)",
          transform: shake && Date.now() - shake < 120 ? `translate(${(Math.random()-0.5)*6}px, ${(Math.random()-0.5)*6}px)` : undefined,
          transition: "transform 60ms",
          backgroundImage: `url(${wildWestBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          touchAction: "manipulation",
          cursor: phase === "playing"
            ? `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'><circle cx='20' cy='20' r='15' fill='none' stroke='%23b91c1c' stroke-width='2.5'/><circle cx='20' cy='20' r='2.5' fill='%23b91c1c'/><line x1='20' y1='2' x2='20' y2='12' stroke='%23b91c1c' stroke-width='2.5'/><line x1='20' y1='28' x2='20' y2='38' stroke='%23b91c1c' stroke-width='2.5'/><line x1='2' y1='20' x2='12' y2='20' stroke='%23b91c1c' stroke-width='2.5'/><line x1='28' y1='20' x2='38' y2='20' stroke='%23b91c1c' stroke-width='2.5'/></svg>") 20 20, crosshair`
            : "default",
        }}
      >
        {/* Top-right controls */}
        <div className="absolute top-3 right-3 z-30 flex gap-2">
          {phase === "playing" && (
            <button
              onClick={(e) => { e.stopPropagation(); paused ? resumeGame() : pauseGame(); }}
              className="bg-amber-950/80 border-2 border-amber-700 rounded-full w-10 h-10 flex items-center justify-center text-amber-100 text-lg hover:bg-amber-900 transition"
              title={paused ? "Resume" : "Pause"}
            >
              {paused ? "▶️" : "⏸️"}
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); toggleMute(); }}
            className="bg-amber-950/80 border-2 border-amber-700 rounded-full w-10 h-10 flex items-center justify-center text-amber-100 text-lg hover:bg-amber-900 transition"
            title={muted ? "Unmute" : "Mute"}
          >
            {muted ? "🔇" : "🔊"}
          </button>
        </div>



        {/* Arena */}
        <div
          ref={arenaRef}
          onClick={missClick}
          className="absolute inset-0"
        >
          {phase === "playing" && (
            <>
              {/* HUD */}
              <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-3 z-10 pointer-events-none">
                <Badge label="SCORE" value={score} />
                <div className="flex-1 mx-2 h-4 bg-amber-950/70 rounded-full overflow-hidden border-2 border-amber-900">
                  <div
                    className="h-full transition-all duration-300"
                    style={{
                      width: `${(timeLeft / GAME_DURATION) * 100}%`,
                      background: timeLeft <= 10
                        ? "linear-gradient(90deg, #dc2626, #f87171)"
                        : "linear-gradient(90deg, #fbbf24, #f97316)",
                    }}
                  />
                </div>
                <Badge label="TIME" value={`${timeLeft}s`} />
                <Badge label="HI" value={highScore} />
              </div>

              {combo > 1 && (
                <div className="absolute top-20 left-1/2 -translate-x-1/2 text-amber-100 text-2xl font-bold drop-shadow-[2px_2px_0_#000] animate-pulse pointer-events-none">
                  COMBO x{Math.min(5, Math.ceil(combo / 3))} 🔥
                </div>
              )}

              {targets.map((t) => (
                <TargetView key={t.id} target={t} onClick={(e) => hitTarget(e, t)} />
              ))}

              {particles.map((p) => (
                <div
                  key={p.id}
                  className="absolute pointer-events-none font-bold text-2xl select-none"
                  style={{
                    left: p.x,
                    top: p.y,
                    transform: "translate(-50%, -50%)",
                    color: p.kind === "hit" ? "#fde68a" : "#fca5a5",
                    textShadow: "2px 2px 0 #000, 0 0 12px rgba(0,0,0,0.6)",
                    animation: "popUp 0.7s ease-out forwards",
                  }}
                >
                  {p.kind === "hit" ? "💥" : "💨"} {p.text}
                </div>
              ))}
            </>
          )}

          {phase === "playing" && paused && (
            <Overlay>
              <Card>
                <h2 className="text-4xl md:text-5xl text-amber-100 mb-4 tracking-wider drop-shadow-[3px_3px_0_#000]">
                  PAUSED
                </h2>
                <p className="text-amber-200 italic mb-6" style={{ fontFamily: "'Special Elite', serif" }}>
                  Catch your breath, partner.
                </p>
                <button onClick={(e) => { e.stopPropagation(); resumeGame(); }} className="cowboy-btn">
                  ▶️ RESUME
                </button>
              </Card>
            </Overlay>
          )}


          {phase === "start" && (
            <Overlay>
              <Card>
                <h1 className="text-5xl md:text-6xl text-amber-100 mb-2 tracking-wider drop-shadow-[3px_3px_0_#000]">
                  WILD WEST<br/>SHOWDOWN
                </h1>
                <p className="text-amber-200 italic mb-6" style={{ fontFamily: "'Special Elite', serif" }}>
                  "Only the quickest draw earns the legend."
                </p>
                <ul className="text-amber-100 text-sm md:text-base mb-6 space-y-1" style={{ fontFamily: "'Special Elite', serif" }}>
                  <li>🤠 Outlaw = 1pt · 🍾 Bottle = 2pt · 🌟 Badge = 3pt</li>
                  <li>Chain hits to build a combo multiplier (up to x5)</li>
                  <li>Missing costs you 1 second — aim true, partner</li>
                </ul>
                <button onClick={startGame} className="cowboy-btn">
                  🔫 DRAW YOUR GUN!
                </button>
              </Card>
            </Overlay>
          )}

          {phase === "over" && (
            <Overlay>
              <Card>
                <h2 className="text-4xl md:text-5xl text-amber-100 mb-4 tracking-wider drop-shadow-[3px_3px_0_#000]">
                  SHOWDOWN OVER
                </h2>
                <div className="grid grid-cols-2 gap-3 mb-4 text-amber-100" style={{ fontFamily: "'Special Elite', serif" }}>
                  <Stat label="Final Score" value={score} />
                  <Stat label="High Score" value={highScore} />
                  <Stat label="Hits" value={hits} />
                  <Stat label="Accuracy" value={`${Math.round(accuracy * 100)}%`} />
                </div>
                <div className="text-2xl text-amber-300 mb-6 drop-shadow-[2px_2px_0_#000]">
                  Rank: {rankFor(score, accuracy)}
                </div>
                <button onClick={startGame} className="cowboy-btn">
                  🤠 PLAY AGAIN
                </button>
              </Card>
            </Overlay>
          )}
        </div>
      </div>

      <style>{`
        @keyframes popUp {
          0% { opacity: 1; transform: translate(-50%, -50%) scale(0.6); }
          100% { opacity: 0; transform: translate(-50%, -180%) scale(1.4); }
        }
        @keyframes targetIn {
          0% { transform: translate(-50%, -50%) scale(0); }
          70% { transform: translate(-50%, -50%) scale(1.2); }
          100% { transform: translate(-50%, -50%) scale(1); }
        }
        .cowboy-btn {
          font-family: 'Rye', serif;
          background: linear-gradient(180deg, #fbbf24 0%, #d97706 100%);
          color: #3b1c08;
          padding: 14px 32px;
          border-radius: 12px;
          font-size: 1.25rem;
          letter-spacing: 0.05em;
          border: 3px solid #78350f;
          box-shadow: 0 6px 0 #78350f, 0 10px 20px rgba(0,0,0,0.4);
          transition: transform 0.1s, box-shadow 0.1s;
          cursor: pointer;
        }
        .cowboy-btn:hover { transform: translateY(2px); box-shadow: 0 4px 0 #78350f, 0 6px 12px rgba(0,0,0,0.4); }
        .cowboy-btn:active { transform: translateY(6px); box-shadow: 0 0 0 #78350f; }
      `}</style>
    </div>
  );
}

function Badge({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-amber-950/80 border-2 border-amber-700 rounded-lg px-3 py-1.5 text-amber-100 shadow-md">
      <div className="text-[10px] tracking-widest text-amber-400 leading-none">{label}</div>
      <div className="text-lg font-bold leading-tight" style={{ fontFamily: "'Rye', serif" }}>{value}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-amber-950/60 border-2 border-amber-700 rounded-lg px-3 py-2">
      <div className="text-xs text-amber-400">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px] z-20">
      {children}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-center p-6 md:p-10 rounded-2xl max-w-lg mx-4 border-[6px] border-amber-900"
      style={{
        background:
          "repeating-linear-gradient(90deg, #6b3410 0 12px, #5a2c0d 12px 14px)",
        boxShadow: "inset 0 0 40px rgba(0,0,0,0.5), 0 20px 50px rgba(0,0,0,0.5)",
      }}
    >
      {children}
    </div>
  );
}

function TargetView({ target, onClick }: { target: Target; onClick: (e: React.MouseEvent) => void }) {
  const meta = KINDS.find((k) => k.kind === target.kind)!;
  const age = Date.now() - target.born;
  const remaining = Math.max(0, 1 - age / target.ttl);
  return (
    <button
      onClick={onClick}
      className="absolute select-none"
      style={{
        left: `${target.x}%`,
        top: `${target.y}%`,
        transform: "translate(-50%, -50%)",
        animation: "targetIn 0.25s ease-out",
        background: "transparent",
        border: "none",
        padding: 0,
        cursor: "inherit",
      }}
    >
      <div className="relative flex items-center justify-center w-20 h-20 md:w-24 md:h-24">
        <div className="absolute inset-0 rounded-full border-[5px] border-amber-100 bg-red-700 shadow-[0_6px_0_#5b1a1a,0_10px_20px_rgba(0,0,0,0.5)]" />
        <div className="absolute inset-2 rounded-full border-[4px] border-red-700 bg-amber-100" />
        <div className="absolute inset-5 rounded-full bg-red-700" />
        <span className="relative text-3xl md:text-4xl drop-shadow-[1px_1px_0_#000]">{meta.emoji}</span>
        {/* TTL ring */}
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="46" fill="none" stroke="#fbbf24" strokeWidth="4"
            strokeDasharray={`${remaining * 289} 289`} opacity="0.9"/>
        </svg>
      </div>
    </button>
  );
}
