"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ListenView from "@/components/ListenView";
import { Loader2 } from "lucide-react";

function ListenPageInner() {
  const params = useSearchParams();
  return <ListenView initialGuild={params.get("guild")} />;
}

export default function ListenPage() {
  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>}>
      <ListenPageInner />
    </Suspense>
  );
}
