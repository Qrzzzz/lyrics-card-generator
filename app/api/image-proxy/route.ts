import { proxyImage } from "@/lib/image-proxy";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return proxyImage(request);
}
