import { NextRequest, NextResponse } from "next/server";
import {
  getWikiChatSessions,
  getChatSessionMessages,
  getWikiById,
} from "@/lib/db";
import { getUserServerClient } from "@/lib/supabase/server";
import { privateWikiGuard } from "@/lib/db.utils";

/**
 * GET /api/chat/sessions?wikiId=xxx        → list sessions for a wiki (auth required)
 * GET /api/chat/sessions?sessionId=xxx     → messages for a specific session (auth required)
 */
export async function GET(req: NextRequest) {
  // Require authentication
  const supabase = await getUserServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }
  const userId = user.id;

  const { searchParams } = req.nextUrl;
  const wikiId = searchParams.get("wikiId");
  const sessionId = searchParams.get("sessionId");

  if (sessionId) {
    const messages = await getChatSessionMessages(sessionId, userId);
    return NextResponse.json(messages);
  }

  if (wikiId) {
    const wiki = await getWikiById(wikiId);
    if (!wiki) {
      return NextResponse.json({ error: "Wiki not found" }, { status: 404 });
    }
    const error = privateWikiGuard(wiki, userId);
    if (error) return error;

    const sessions = await getWikiChatSessions(wikiId, userId);
    return NextResponse.json(sessions);
  }

  return NextResponse.json(
    { error: "Provide wikiId or sessionId" },
    { status: 400 },
  );
}
