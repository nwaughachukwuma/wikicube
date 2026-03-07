import type { Wiki } from "@/lib/types";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface ChatSession {
  session_id: string;
  preview: string;
  last_activity: string;
  message_count: number;
}

export interface ChatPanelProps {
  wiki: Wiki;
  /** Current page title + summary passed as extra context to the model */
  pageContext?: string;
}
