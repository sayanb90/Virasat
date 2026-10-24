"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * My notes is the home screen; the safety check-in lives on its own route.
 *
 * A client-side redirect, because the app builds as a static export and a
 * server `redirect()` has no server to run on.
 */
export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/notes");
  }, [router]);
  return null;
}
