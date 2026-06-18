import { checkGitHubUpdate } from "@/lib/github-update";

export const runtime = "nodejs";

export async function GET() {
  const result = await checkGitHubUpdate();
  const status = result.status === "error" ? 502 : 200;

  return Response.json(result, { status });
}
