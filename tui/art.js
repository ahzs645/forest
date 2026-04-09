import { ASCII_ART, ANIMATIONS } from "../js/ascii_art.js";
import * as Anim from "../js/animations/index.js";
import { SEASONS } from "../js/engine.js";

export function detectArt(text, gs) {
  const lower = text.toLowerCase();
  if (lower.includes("bear") || lower.includes("wildlife")) return wrap(ASCII_ART.bear, 600);
  if (lower.includes("moose")) return wrap(Anim.mooseAnimation, 500);
  if (lower.includes("eagle") || lower.includes("bird")) return wrap(Anim.eagleAnimation, 400);
  if (lower.includes("rain")) return wrap(ASCII_ART.rain, 300);
  if (lower.includes("snow") || (gs && SEASONS[gs.round - 1] === "Winter")) {
    return wrap(ASCII_ART.snow, 400);
  }
  if (lower.includes("fire") || lower.includes("burn")) return wrap(Anim.wildfireAnimation, 250);
  if (lower.includes("camp") || lower.includes("welcome")) return wrap(ASCII_ART.campfire, 350);
  if (lower.includes("harvest") || lower.includes("cut")) return wrap(ASCII_ART.tree, 600);
  if (lower.includes("transport") || lower.includes("haul")) return wrap(ASCII_ART.truck, 500);
  if (lower.includes("river") || lower.includes("water")) return wrap(Anim.riverAnimation, 350);
  if (lower.includes("morning") || lower.includes("dawn")) return wrap(Anim.sunrisesetAnimation, 400);
  return null;
}

function wrap(frames, delay) {
  if (!frames?.length) return null;
  return { frames, delay };
}

export function matchAnimation(label) {
  const lower = label.toLowerCase();
  if (/harvest|cut|fell/.test(lower)) return { frames: ANIMATIONS.treeFalling, delay: 200 };
  if (lower.includes("chainsaw")) return { frames: Anim.chainsawAnimation, delay: 200 };
  if (/transport|haul|truck/.test(lower)) return { frames: ANIMATIONS.truckDriving, delay: 200 };
  if (/fly|helicopter|air/.test(lower)) return { frames: Anim.helicopterAnimation, delay: 200 };
  if (/plant|seed/.test(lower)) return { frames: Anim.treePlantingAnimation, delay: 300 };
  if (/drone|survey/.test(lower)) return { frames: Anim.droneAnimation, delay: 200 };
  if (/radio|call/.test(lower)) return { frames: Anim.walkieTalkieAnimation, delay: 300 };
  if (/map|plan/.test(lower)) return { frames: Anim.mapAnimation, delay: 400 };
  if (/compass|navigate/.test(lower)) return { frames: Anim.compassAnimation, delay: 300 };
  if (/walk|hike|boot/.test(lower)) return { frames: Anim.bootAnimation, delay: 300 };
  return null;
}
