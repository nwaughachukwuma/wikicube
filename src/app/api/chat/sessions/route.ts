import { NextRequest, NextResponse } from "next/server";
import {
  getWikiChatSessions,
  getChatSessionMessages,
  getWikiById,
} from "@/lib/db";
import { authRouteGuard, privateWikiGuard } from "@/lib/db.utils";

/**
 * GET /api/chat/sessions?wikiId=xxx        → list sessions for a wiki (auth required)
 * GET /api/chat/sessions?wikiId=xxx&sessionId=xxx     → messages for a specific session (auth required)
 */
export async function GET(req: NextRequest) {
  const { user, err } = await authRouteGuard();
  if (err) return err;

  const { searchParams } = req.nextUrl;
  const wikiId = searchParams.get("wikiId");
  if (!wikiId) {
    return NextResponse.json(
      { error: "Provide wikiId or sessionId" },
      { status: 400 },
    );
  }

  const sessionId = searchParams.get("sessionId");
  if (sessionId) {
    const messages = await getChatSessionMessages(wikiId, sessionId, user.id);
    return NextResponse.json(messages);
  }

  const wiki = await getWikiById(wikiId);
  if (!wiki) {
    return NextResponse.json({ error: "Wiki not found" }, { status: 404 });
  }
  const error = privateWikiGuard(wiki, user.id);
  if (error) return error;

  const sessions = await getWikiChatSessions(wikiId, user.id);
  return NextResponse.json(sessions);
}
