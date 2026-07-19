export function GET() {
  return Response.json({ status: "ok", service: "printa", mcp: "/mcp" });
}
