export const MODEL_STL_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
  "Access-Control-Expose-Headers": [
    "Content-Disposition",
    "Content-Length",
    "Server-Timing",
    "X-Printa-Cache",
    "X-Printa-Dimensions",
    "X-Printa-Exceeds",
    "X-Printa-Interior-Struts",
    "X-Printa-Material",
    "X-Printa-Preview",
    "X-Printa-Triangles",
    "X-Printa-Volume",
  ].join(", "),
} as const;
