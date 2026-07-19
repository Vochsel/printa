import { modelSpecJsonSchema } from "@/lib/model-spec";

export function GET() {
  return Response.json(modelSpecJsonSchema(), {
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" },
  });
}
