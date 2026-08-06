import { createHmac } from "node:crypto";

const STARTUP_SECRET_ENV = "LYRICS_CARD_SERVER_STARTUP_SECRET";
const CHALLENGE_HEADER = "x-lyrics-card-startup-challenge";
const SERVICE_ID = "lyrics-card-generator-desktop";
const HEX_256_PATTERN = /^[a-f0-9]{64}$/;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  const startupSecret = process.env[STARTUP_SECRET_ENV] ?? "";
  const challenge = request.headers.get(CHALLENGE_HEADER) ?? "";
  if (!HEX_256_PATTERN.test(startupSecret) || !HEX_256_PATTERN.test(challenge)) {
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" }
    });
  }

  const proof = createHmac("sha256", startupSecret).update(challenge).digest("hex");
  return Response.json(
    { service: SERVICE_ID, proof },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
