import { DEMO_MODEL_CARDS } from "@/lib/demo-models";

export function GET() {
  return Response.json({ models: DEMO_MODEL_CARDS }, {
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" },
  });
}
