"use client";

import { useEffect, useState } from "react";
import { deviceBridge, type Biometrics } from "./bridge";

/**
 * What this phone's biometric unlock is called, and whether it has one.
 * "Face ID" until the platform answers, which is also the browser harness's
 * answer, so screens do not change their wording under the person's eyes.
 */
export function useBiometrics(): Biometrics {
  const [biometrics, setBiometrics] = useState<Biometrics>({ available: true, label: "Face ID" });
  useEffect(() => {
    let cancelled = false;
    deviceBridge()
      .biometrics()
      .then((b) => !cancelled && setBiometrics(b))
      .catch(() => !cancelled && setBiometrics({ available: false, label: "Face ID" }));
    return () => {
      cancelled = true;
    };
  }, []);
  return biometrics;
}
