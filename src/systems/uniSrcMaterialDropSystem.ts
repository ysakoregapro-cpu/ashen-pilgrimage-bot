import { roll, randomInt } from '../utils/random';
import {
  FURNACE_KEEPER_BOSS_ID,
  UNI_SRC_MATERIAL_IDS,
  UNI_SRC_DROP_TRIGGER_RATE,
} from '../db/seedData/jobProgressionMaster';

export { FURNACE_KEEPER_BOSS_ID, UNI_SRC_DROP_TRIGGER_RATE, UNI_SRC_MATERIAL_IDS };

export function pickRandomUniSrcMaterial(): string {
  return UNI_SRC_MATERIAL_IDS[randomInt(0, UNI_SRC_MATERIAL_IDS.length - 1)]!;
}

/** 炉熱の番人 — 初回撃破1個確定(ランダム種) / 再戦は発生率後に16種抽選 */
export function rollUniSrcMaterialFromFurnaceKeeper(opts: {
  wasFirstKill: boolean;
  isRematch: boolean;
}): string | null {
  if (opts.wasFirstKill && !opts.isRematch) {
    return pickRandomUniSrcMaterial();
  }
  if (opts.isRematch && roll(UNI_SRC_DROP_TRIGGER_RATE)) {
    return pickRandomUniSrcMaterial();
  }
  return null;
}
