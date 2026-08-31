import { checkGitHubUpdate } from "@/lib/github-update";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const result = await checkGitHubUpdate(undefined, request.signal);
  const status = result.status !== "error"
    ? 200
    : result.code === "cancelled"
      ? 499
      : result.code === "timeout"
        ? 504
        : 502;

  return Response.json(result, { status });
}
