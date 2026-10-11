"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { LoadingState, Notice } from "./ui";
import { useProviderStatuses } from "@/lib/providers";
import { useServerConfig } from "@/lib/providers/api";
import type { ProviderId } from "@/lib/types";

/** Explains, instead of failing silently, when a provider isn't configured or is turned off. */
export function ProviderGate({ provider, children }: { provider: ProviderId; children: ReactNode }) {
  const loaded = useServerConfig((s) => s.loaded);
  const status = useProviderStatuses().find((s) => s.id === provider)!;
  // Apple Music is configured client-side through MusicKit, but still needs the server's developer token.
  if (!loaded) return <LoadingState label="Checking provider…" />;
  if (!status.ready)
    return (
      <Notice tone="warn">
        {status.reason}{" "}
        <Link href="/settings#providers" className="underline">
          Open settings
        </Link>
      </Notice>
    );
  return <>{children}</>;
}
