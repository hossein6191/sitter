"use client";

// Whether the demo sitter can act right now, its address, and exactly why not (null while asking).

import * as React from "react";

import { readDemoStatus } from "@/lib/chain";
import type { DemoStatus } from "@/lib/types";

export function useDemoStatus(): DemoStatus | null {
  const [status, setStatus] = React.useState<DemoStatus | null>(null);
  React.useEffect(() => {
    let live = true;
    void readDemoStatus().then((s) => {
      if (live) setStatus(s);
    });
    return () => {
      live = false;
    };
  }, []);
  return status;
}
