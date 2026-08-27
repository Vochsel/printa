import { z } from "zod";
import { bakePlace } from "@/lib/place-bake";
import { MAX_CAPTURE_RADIUS_M, type PlaceCaptureEvent } from "@/lib/place-capture";

/**
 * Capture a real place into the baked form a document carries.
 *
 * The editor sends coordinates and gets back the packed ground — and, for the
 * mapped variant, building outlines — which it writes straight into the place
 * source. Progress is streamed as NDJSON: a photogrammetric capture is a few
 * hundred tile fetches and takes long enough that a bare spinner is not
 * enough to tell a slow capture from a stuck one.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const requestSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radiusM: z.number().min(50).max(4000),
  capture: z.enum(["surface", "buildings"]),
  label: z.string().max(160).optional(),
}).strict();

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid capture request." },
      { status: 400 },
    );
  }

  const { lat, lng, radiusM, capture, label } = parsed.data;
  const limit = MAX_CAPTURE_RADIUS_M[capture];
  if (radiusM > limit) {
    return Response.json(
      { error: `A ${capture} capture is limited to ${limit} m; ${radiusM} m would fetch far more detail than a print can show.` },
      { status: 400 },
    );
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY ?? "";
  if (capture === "surface" && !apiKey) {
    return Response.json(
      { error: "This deployment has no Google Maps key, so it cannot capture a photogrammetric surface. Mapped buildings work without one." },
      { status: 501 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: PlaceCaptureEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      // Tiles report one event each, which for a dense capture is a thousand
      // lines nobody reads. A percent step keeps the bar honest and the
      // stream small.
      let lastStage = "";
      let lastPercent = -1;
      const onProgress = (stage: string, done: number, total: number) => {
        const percent = total > 0 ? Math.floor((done / total) * 100) : 0;
        if (stage === lastStage && percent === lastPercent && done !== total) return;
        lastStage = stage;
        lastPercent = percent;
        send({ type: "progress", stage, done, total });
      };

      try {
        const result = await bakePlace({ lat, lng, radiusM, capture, label, apiKey, onProgress });
        send({ type: "result", ...result });
      } catch (error) {
        send({ type: "error", message: error instanceof Error ? error.message : "Could not capture this place." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      // Proxies that buffer would hold every progress line until the capture
      // finished, which is the opposite of what streaming is for.
      "X-Accel-Buffering": "no",
    },
  });
}
