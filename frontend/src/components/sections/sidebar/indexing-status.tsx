import React, { FunctionComponent, useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

const API_BASE = typeof window !== "undefined" ? "" : (process.env.SERVER_URL ?? "");
const DONE_VISIBLE_MS = 8000; // How long the "finished" banner stays visible

interface IndexStatus {
    indexing: boolean;
    phase: string;
    current_file: string;
    file_index: number;
    total_files: number;
    chunks_so_far: number;
    embed_batch: number;
    embed_total_batches: number;
    kb_name: string;
    finished_at: string; // ISO timestamp, set when done
}

export const IndexingStatus: FunctionComponent = () => {
    const [status, setStatus] = useState<IndexStatus | null>(null);
    const [showDone, setShowDone] = useState(false);
    const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const prevFinishedAt = useRef<string>("");

    useEffect(() => {
        let active = true;

        const poll = async () => {
            try {
                const r = await fetch(`${API_BASE}/api/v1/rag/reindex-status`, { credentials: "include" });
                if (r.ok) {
                    const data: IndexStatus = await r.json();
                    if (!active) return;
                    setStatus(data);

                    // When indexing just finished (finished_at changed), show done banner
                    if (!data.indexing && data.finished_at && data.finished_at !== prevFinishedAt.current) {
                        prevFinishedAt.current = data.finished_at;
                        setShowDone(true);
                        if (doneTimer.current) clearTimeout(doneTimer.current);
                        doneTimer.current = setTimeout(() => setShowDone(false), DONE_VISIBLE_MS);
                    }
                }
            } catch { /* ignore */ }
        };

        poll();
        const id = setInterval(poll, 2000);
        return () => {
            active = false;
            clearInterval(id);
            if (doneTimer.current) clearTimeout(doneTimer.current);
        };
    }, []);

    // Show progress banner while indexing
    if (status?.indexing) {
        const isEmbedding = status.phase === "embedding";
        const pct = isEmbedding
            ? (status.embed_total_batches > 0 ? Math.round((status.embed_batch / status.embed_total_batches) * 100) : 0)
            : (status.total_files > 0 ? Math.round((status.file_index / status.total_files) * 100) : 0);

        return (
            <div className="mx-2 mb-1 px-3 py-2 rounded-md bg-blue-950/60 border border-blue-800/50 text-xs text-blue-200 space-y-1">
                <div className="flex items-center gap-1.5 font-medium">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {isEmbedding ? "Embeddings berechnen…" : "Dateien laden…"}
                    {status.kb_name && (
                        <span className="opacity-60 font-normal truncate">· {status.kb_name}</span>
                    )}
                </div>
                {!isEmbedding && status.current_file && (
                    <div className="truncate opacity-70" title={status.current_file}>
                        {status.current_file}
                    </div>
                )}
                <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 bg-blue-900 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-blue-400 rounded-full transition-all duration-500"
                            style={{ width: `${pct}%` }}
                        />
                    </div>
                    <span className="opacity-70 shrink-0">
                        {isEmbedding
                            ? (status.embed_total_batches > 0 ? `Batch ${status.embed_batch}/${status.embed_total_batches}` : "Starte…")
                            : `${status.file_index}/${status.total_files} · ${status.chunks_so_far} Chunks`
                        }
                    </span>
                </div>
            </div>
        );
    }

    // Show done banner briefly after completion
    if (showDone && status?.finished_at) {
        const time = new Date(status.finished_at).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
        const kbLabel = status.kb_name ? ` ${status.kb_name}` : "";
        return (
            <div className="mx-2 mb-1 px-3 py-2 rounded-md bg-green-950/60 border border-green-800/50 text-xs text-green-200 flex items-center gap-1.5">
                <CheckCircle2 className="h-3 w-3 shrink-0 text-green-400" />
                <span>Indexierung{kbLabel} beendet um {time}</span>
            </div>
        );
    }

    return null;
};
