"use client";

import { useEffect, useState } from "react";
import { deviceBridge, type Biometrics, type DeviceBridge } from "./bridge";

/** Until the platform answers, and the browser harness's answer. */
export const DEFAULT_BIOMETRICS: Biometrics = { available: true, label: "Face ID" };

/** Asks the bridge; a phone that cannot say has no biometrics to offer. */
export async function loadBiometrics(bridge: Pick<DeviceBridge, "biometrics">): Promise<Biometrics> {
  try {
    return await bridge.biometrics();
  } catch {
    return { available: false, label: DEFAULT_BIOMETRICS.label };
  }
}

/* c8 ignore start -- React glue around loadBiometrics, which is unit tested.
   Rendering it needs a DOM; Playwright renders it on the set-up and unlock
   screens. */
/**
 * What this phone's biometric unlock is called, and whether it has one.
 * "Face ID" until the platform answers, which is also the browser harness's
 * answer, so screens do not change their wording under the person's eyes.
 */
export function useBiometrics(): Biometrics {
  const [biometrics, setBiometrics] = useState<Biometrics>(DEFAULT_BIOMETRICS);
  useEffect(() => {
    let cancelled = false;
    void loadBiometrics(deviceBridge()).then((b) => {
      if (!cancelled) setBiometrics(b);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return biometrics;
}
/* c8 ignore stop */
