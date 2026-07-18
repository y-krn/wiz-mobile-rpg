// Audio Manager using Web Audio API to synthesize retro 8-bit sounds.
let audioCtx = null;

// Initialize mute state from localStorage (guard for non-browser/SSR/test環境)
let isMuted = typeof localStorage !== "undefined" &&
  localStorage.getItem("mobile_wiz_rpg_muted") === "true";

export const getIsMuted = () => isMuted;

export const toggleMute = () => {
  isMuted = !isMuted;
  localStorage.setItem("mobile_wiz_rpg_muted", isMuted ? "true" : "false");
  if (!isMuted) {
    unlockAudio();
  }
  return isMuted;
};

function getAudioContext() {
  // ブラウザ以外(node/SSR/テスト)ではWeb Audio非在。無音で黙って抜ける。
  const Ctor = typeof window !== "undefined" &&
    (window.AudioContext || window.webkitAudioContext);
  if (!Ctor) return null;
  if (!audioCtx) {
    audioCtx = new Ctor();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function unlockAudio() {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (ctx && ctx.state === "suspended") {
    ctx.resume().then(() => {
      removeUnlockListeners();
    }).catch(() => {});
  } else if (ctx && ctx.state === "running") {
    removeUnlockListeners();
  }
}

const unlockEvents = ["click", "touchstart", "touchend", "keydown"];
function removeUnlockListeners() {
  if (typeof document !== "undefined" && typeof document.removeEventListener === "function") {
    unlockEvents.forEach(e => document.removeEventListener(e, unlockAudio));
  }
}
if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
  unlockEvents.forEach(e => document.addEventListener(e, unlockAudio, { passive: true }));
}

export const playSound = (type) => {
  if (isMuted) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    switch (type) {
      case "move": {
        // Short soft blip
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(180, now + 0.08);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.08);
        break;
      }
      case "bump": {
        // Dull thud
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(80, now);
        osc.frequency.linearRampToValueAtTime(30, now + 0.15);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.15);
        break;
      }
      case "hit": {
        // Retro explosion/strike sound
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.25);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.25);
        break;
      }
      case "miss": {
        // Soft swish
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.2);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.2);
        break;
      }
      case "heal": {
        // Ascending sparkly chime
        const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99]; // C E G C E G
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(freq, now + idx * 0.05);
          gain.gain.setValueAtTime(0.0, now + idx * 0.05);
          gain.gain.linearRampToValueAtTime(0.08, now + idx * 0.05 + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.005, now + idx * 0.05 + 0.2);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + idx * 0.05);
          osc.stop(now + idx * 0.05 + 0.2);
        });
        break;
      }
      case "cast_spell": {
        // Magic charging sound
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.linearRampToValueAtTime(600, now + 0.4);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.linearRampToValueAtTime(0.08, now + 0.3);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.4);
        break;
      }
      case "level_up": {
        // Triumphant RPG level up tune
        const notes = [261.63, 329.63, 392.00, 523.25, 392.00, 523.25, 783.99]; // C4 E4 G4 C5 G4 C5 G5
        const durs = [0.1, 0.1, 0.1, 0.15, 0.1, 0.1, 0.4];
        let totalTime = 0;
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "square";
          osc.frequency.setValueAtTime(freq, now + totalTime);
          gain.gain.setValueAtTime(0.08, now + totalTime);
          gain.gain.exponentialRampToValueAtTime(0.01, now + totalTime + durs[idx]);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + totalTime);
          osc.stop(now + totalTime + durs[idx]);
          totalTime += durs[idx] * 0.8; // overlap slightly
        });
        break;
      }
      case "item": {
        // Metallic coin sound (double chime)
        [987.77, 1318.51].forEach((freq, idx) => { // B5, E6
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(freq, now + idx * 0.08);
          gain.gain.setValueAtTime(0.1, now + idx * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.005, now + idx * 0.08 + 0.25);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + idx * 0.08);
          osc.stop(now + idx * 0.08 + 0.25);
        });
        break;
      }
      case "chest_trap": {
        // Shocking buzzer alarm
        for (let i = 0; i < 4; i++) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sawtooth";
          osc.frequency.setValueAtTime(110 + (i % 2) * 50, now + i * 0.08);
          gain.gain.setValueAtTime(0.12, now + i * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.08 + 0.08);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + i * 0.08);
          osc.stop(now + i * 0.08 + 0.08);
        }
        break;
      }
      case "game_over": {
        // Sad minor theme descending
        const notes = [392.00, 349.23, 311.13, 246.94]; // G4, F4, Eb4, B3
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "triangle";
          osc.frequency.setValueAtTime(freq, now + idx * 0.2);
          gain.gain.setValueAtTime(0.12, now + idx * 0.2);
          gain.gain.exponentialRampToValueAtTime(0.005, now + idx * 0.2 + 0.3);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + idx * 0.2);
          osc.stop(now + idx * 0.2 + 0.3);
        });
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.warn("Audio Context failed to play sound: ", err);
  }
};
