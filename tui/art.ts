import { ASCII_ART, ANIMATIONS } from "../js/ascii_art.js";
import * as Anim from "../js/animations/index.js";
import { SEASONS } from "../js/engine.js";

export interface ArtSequence {
  frames: string[];
  delay: number;
}

/** Pick ambient art frames based on phase text keywords. */
export function detectArt(text: string, gs: any): ArtSequence | null {
  const l = text.toLowerCase();
  if (l.includes("bear") || l.includes("wildlife"))
    return wrap(ASCII_ART.bear, 600);
  if (l.includes("moose"))
    return wrap(Anim.mooseAnimation, 500);
  if (l.includes("eagle") || l.includes("bird"))
    return wrap(Anim.eagleAnimation, 400);
  if (l.includes("rain"))
    return wrap(ASCII_ART.rain, 300);
  if (l.includes("snow") || (gs && SEASONS[gs.round - 1] === "Winter"))
    return wrap(ASCII_ART.snow, 400);
  if (l.includes("fire") || l.includes("burn"))
    return wrap(Anim.wildfireAnimation, 250);
  if (l.includes("camp") || l.includes("welcome"))
    return wrap(ASCII_ART.campfire, 350);
  if (l.includes("harvest") || l.includes("cut"))
    return wrap(ASCII_ART.tree, 600);
  if (l.includes("transport") || l.includes("haul"))
    return wrap(ASCII_ART.truck, 500);
  if (l.includes("river") || l.includes("water"))
    return wrap(Anim.riverAnimation, 350);
  if (l.includes("morning") || l.includes("dawn"))
    return wrap(Anim.sunrisesetAnimation, 400);
  return null;
}

function wrap(frames: string[] | undefined, delay: number): ArtSequence | null {
  if (!frames?.length) return null;
  return { frames, delay };
}

/** Match an option label to a contextual animation for the overlay. */
export function matchAnimation(label: string): { frames: string[]; delay: number } | null {
  const l = label.toLowerCase();
  if (/harvest|cut|fell/.test(l)) return { frames: ANIMATIONS.treeFalling, delay: 200 };
  if (l.includes("chainsaw")) return { frames: Anim.chainsawAnimation, delay: 200 };
  if (/transport|haul|truck/.test(l)) return { frames: ANIMATIONS.truckDriving, delay: 200 };
  if (/fly|helicopter|air/.test(l)) return { frames: Anim.helicopterAnimation, delay: 200 };
  if (/plant|seed/.test(l)) return { frames: Anim.treePlantingAnimation, delay: 300 };
  if (/drone|survey/.test(l)) return { frames: Anim.droneAnimation, delay: 200 };
  if (/radio|call/.test(l)) return { frames: Anim.walkieTalkieAnimation, delay: 300 };
  if (/map|plan/.test(l)) return { frames: Anim.mapAnimation, delay: 400 };
  if (/compass|navigate/.test(l)) return { frames: Anim.compassAnimation, delay: 300 };
  if (/walk|hike|boot/.test(l)) return { frames: Anim.bootAnimation, delay: 300 };
  return null;
}
