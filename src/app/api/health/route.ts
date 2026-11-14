// Compose healthcheck (U10): cheap, no database or session, never cached.
export function GET() {
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
