# Printa

Printa is a Vercel-ready Next.js app and MCP server for creating printable 3D models. The first generator turns short text into a closed, bevelled, binary STL solid.

## What is included

- Three.js playground with orbit controls, searchable Google Fonts, unit-aware sliders, and live dimensions
- Deterministic binary STL downloads at `/api/stl`
- Stateless Streamable HTTP MCP server at `/mcp`
- MCP Apps UI resource for interactive use inside ChatGPT
- No authentication or persistent storage

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The MCP endpoint is `http://localhost:3000/mcp`.

## Verify

```bash
npm run build
npm test
```

## Deploy to Vercel

Import the repository into Vercel or run:

```bash
npx vercel --prod
```

After deployment, add `https://your-domain.vercel.app/mcp` as the remote MCP server URL in ChatGPT developer mode. No environment variables are required.

## MCP tool

`create_extruded_text` accepts:

- `text` — 1–24 characters
- `font` — any of the 1,900+ Google Fonts family names
- `size_mm` — any positive letter height in millimetres
- `depth_mm` — any positive extrusion depth in millimetres
- `bevel_mm` — any non-negative bevel size in millimetres
- `bevel_segments` — 1–12 subdivisions for smooth bevels
- `curve_segments` — 2–24 subdivisions for curved outlines
- `bevel_side` — `both`, `top`, or `bottom`
- `smooth_normals` — smooth preview shading on or off
- `text_case` — `original`, `uppercase`, `lowercase`, or `titlecase`
- `font_weight` — `regular` or the closest available `bold` weight
- `italic` — real italic variant with a synthetic slant fallback
- `underline` — add a printable underline bar

It returns exact mesh dimensions, triangle count, a binary STL URL, and the attached interactive MCP UI. There is no hard physical-size limit: the editor and MCP UI provide convenient common-range sliders plus unrestricted numeric inputs. Models larger than 256 × 256 × 256 mm on any axis remain downloadable and receive both a visible warning and machine-readable warning fields in the MCP result.
