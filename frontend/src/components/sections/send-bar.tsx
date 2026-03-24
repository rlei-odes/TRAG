import React, { FunctionComponent, useEffect, useState } from "react";
import { NewMessageInput } from "@/components/ui/new-message-input";
import { useTranslation } from "react-i18next";
import { Suggestion, Suggestions } from "@/components/ui/suggestion";
import { Disclaimer } from "@/components/ui/disclaimer";
import { SendHorizonal, Square, Tag } from "lucide-react";
import { cn } from "@/lib/lorem";
import { useMessaging } from "@/hooks/useMessaging";
import { MessageTypes } from "@/services/message";

const API_BASE = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:8080";

// Strip common prefixes and extension from filenames for readable display
function cleanFilename(filename: string): string {
    return filename.replace(/\.(pdf|xlsx|xls|docx|doc|md|txt|csv)$/i, "").replace(/^[A-Z]+_/, "").replace(/_/g, " ");
}

export const SendBar: FunctionComponent = () => {
    const { thread, sendMessage: sendMessageStream, stopSending, sending, loading, cursor, sessionLabel, setSessionLabel, activeConversationId } = useMessaging();
    const [message, setMessage] = React.useState<string>("");
    const { t } = useTranslation("app");
    const [kbFiles, setKbFiles] = useState<string[]>([]);

    useEffect(() => {
        fetch(`${API_BASE}/api/v1/rag/store-info`, { credentials: "include" })
            .then((r) => r.ok ? r.json() : null)
            .then((d) => { if (d?.file_list?.length) setKbFiles(d.file_list); })
            .catch(() => {});
    }, []);

    const showSuggestions = !loading && !thread.length;

    const handleSendMessage = (message: string) => {
        if (!sending) {
            sendMessageStream(message, MessageTypes.NEXT, cursor);
            setMessage("");
        }
    };

    // Build dynamic suggestions from KB files (2 file-specific + 2 generic)
    const buildSuggestions = (): Suggestion[] => {
        const templates: Suggestion[] = t("suggestionTemplates", { returnObjects: true }) as Suggestion[];
        const fallback: Suggestion[] = t("suggestions", { returnObjects: true }) as Suggestion[];
        if (!kbFiles.length || !Array.isArray(templates)) return fallback;

        const picked = kbFiles.slice(0, 2);
        const dynamic: Suggestion[] = picked.map((file, i) => {
            const tpl = templates[i % templates.length];
            const label = cleanFilename(file);
            return {
                text: tpl.text,
                subtext: (tpl.subtext ?? "").replace("{{file}}", label),
            };
        });
        return [...dynamic, ...fallback.slice(0, 2)];
    };

    const suggestions = buildSuggestions();

    const disabled = message.length === 0 || sending;

    return (
        <div className="w-full flex justify-center">
            <div className="w-full m-2 md:w-3/4 max-w-[700px]">
                <div className="flex justify-center w-full flex-col px-2 sm:px-0">
                    {showSuggestions ? (
                        <div className="px:0 pb-2 sm:p-2 overflow-scroll scrollbar-hide">
                            <Suggestions suggestions={suggestions} onClick={handleSendMessage} />
                        </div>
                    ) : null}
                    <div className="relative flex items-center">
                        <NewMessageInput
                            className="pr-12 w-full text-base"
                            value={message}
                            onChange={(e) => {
                                setMessage(e.target.value);
                            }}
                            placeholder={t("messagePlaceholder")}
                            onPressEnter={() => handleSendMessage(message)}
                        />
                        {sending ? (
                            <Square
                                className="absolute right-0 bottom-0 mb-3 mr-3 p-2 h-9 w-9 border text-white rounded cursor-pointer bg-red-500 hover:bg-red-400 border-red-400 transition ease-in-out duration-300"
                                onClick={stopSending}
                            />
                        ) : (
                            <SendHorizonal
                                className={cn(
                                    "absolute right-0 bottom-0 mb-3 mr-3 p-2 h-9 w-9 border text-white rounded transition ease-in-out duration-300",
                                    disabled ? "bg-gray-400 cursor-default" : "cursor-pointer bg-secondary hover:bg-secondary/85 border-secondary/20",
                                )}
                                onClick={() => !disabled && handleSendMessage(message)}
                            />
                        )}
                    </div>
                    {/* Session label — only show when starting a new conversation */}
                    {!activeConversationId && (
                        <div className="flex items-center gap-2 mt-1.5 px-1">
                            <Tag className="h-3.5 w-3.5 text-amber-400/70 shrink-0" />
                            <input
                                type="text"
                                value={sessionLabel}
                                onChange={(e) => setSessionLabel(e.target.value)}
                                placeholder="Test-Session (optional)"
                                className="flex-1 text-xs bg-transparent border-b border-foreground/10 focus:border-amber-400/50 outline-none text-muted-foreground placeholder:text-foreground/20 py-0.5 transition-colors"
                            />
                        </div>
                    )}
                    <Disclaimer />
                </div>
            </div>
        </div>
    );
};
