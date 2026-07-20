import { BufferAttribute, BufferGeometry } from "three";
import { weldGeometryPositions } from "@/lib/geometry-weld";

export type SubdivisionScheme = "catmull-clark" | "loop" | "linear";
export type SubdivisionBoundary = "sharp" | "smooth";

type PositionArray = Float32Array<ArrayBufferLike>;
type PolygonMesh = { positions: PositionArray; faces: number[][] };
type TriangleMesh = { positions: PositionArray; triangles: number[] };
type Edge = { a: number; b: number; faces: number[]; opposites: number[]; index: number };

const coordinate = (positions: PositionArray, vertex: number, axis: number) => positions[vertex * 3 + axis];

function edgeKey(a: number, b: number, vertexCount: number) {
  return a < b ? a * vertexCount + b : b * vertexCount + a;
}

function addEdge(
  edges: Map<number, Edge>,
  a: number,
  b: number,
  face: number,
  opposite: number,
  vertexCount: number,
) {
  const key = edgeKey(a, b, vertexCount);
  let edge = edges.get(key);
  if (!edge) {
    edge = { a: Math.min(a, b), b: Math.max(a, b), faces: [], opposites: [], index: -1 };
    edges.set(key, edge);
  }
  edge.faces.push(face);
  if (opposite >= 0) edge.opposites.push(opposite);
  return edge;
}

function boundaryPosition(
  positions: PositionArray,
  vertex: number,
  neighbors: number[],
  axis: number,
  boundary: SubdivisionBoundary,
) {
  const value = coordinate(positions, vertex, axis);
  if (boundary === "sharp" || neighbors.length !== 2) return value;
  return value * 0.75
    + (coordinate(positions, neighbors[0], axis) + coordinate(positions, neighbors[1], axis)) * 0.125;
}

function catmullClarkLevel(mesh: PolygonMesh, boundary: SubdivisionBoundary): PolygonMesh {
  const { positions, faces } = mesh;
  const vertexCount = positions.length / 3;
  const edges = new Map<number, Edge>();
  const faceEdges: Edge[][] = Array.from({ length: faces.length });
  const vertexFaces = Array.from({ length: vertexCount }, () => [] as number[]);
  const vertexEdges = Array.from({ length: vertexCount }, () => [] as Edge[]);
  const facePoints = new Float32Array(faces.length * 3);

  for (let faceIndex = 0; faceIndex < faces.length; faceIndex += 1) {
    const face = faces[faceIndex];
    const currentEdges: Edge[] = [];
    for (let axis = 0; axis < 3; axis += 1) {
      let sum = 0;
      for (const vertex of face) sum += coordinate(positions, vertex, axis);
      facePoints[faceIndex * 3 + axis] = sum / face.length;
    }
    for (let corner = 0; corner < face.length; corner += 1) {
      const vertex = face[corner];
      vertexFaces[vertex].push(faceIndex);
      currentEdges.push(addEdge(edges, vertex, face[(corner + 1) % face.length], faceIndex, -1, vertexCount));
    }
    faceEdges[faceIndex] = currentEdges;
  }

  let edgeOffset = vertexCount;
  for (const edge of edges.values()) {
    edge.index = edgeOffset;
    edgeOffset += 1;
    vertexEdges[edge.a].push(edge);
    vertexEdges[edge.b].push(edge);
  }
  const faceOffset = edgeOffset;
  const nextPositions = new Float32Array((faceOffset + faces.length) * 3);

  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const incidentEdges = vertexEdges[vertex];
    const boundaryEdges = incidentEdges.filter((edge) => edge.faces.length !== 2);
    const boundaryNeighbors = boundaryEdges.map((edge) => edge.a === vertex ? edge.b : edge.a);
    for (let axis = 0; axis < 3; axis += 1) {
      const source = coordinate(positions, vertex, axis);
      if (boundaryEdges.length) {
        nextPositions[vertex * 3 + axis] = boundaryPosition(positions, vertex, boundaryNeighbors, axis, boundary);
        continue;
      }
      const incidentFaces = vertexFaces[vertex];
      if (!incidentEdges.length || !incidentFaces.length) {
        nextPositions[vertex * 3 + axis] = source;
        continue;
      }
      let faceAverage = 0;
      for (const face of incidentFaces) faceAverage += facePoints[face * 3 + axis];
      faceAverage /= incidentFaces.length;
      let edgeAverage = 0;
      for (const edge of incidentEdges) {
        edgeAverage += (coordinate(positions, edge.a, axis) + coordinate(positions, edge.b, axis)) * 0.5;
      }
      edgeAverage /= incidentEdges.length;
      const valence = incidentEdges.length;
      nextPositions[vertex * 3 + axis] = (faceAverage + edgeAverage * 2 + source * (valence - 3)) / valence;
    }
  }

  for (const edge of edges.values()) {
    for (let axis = 0; axis < 3; axis += 1) {
      const endpoints = coordinate(positions, edge.a, axis) + coordinate(positions, edge.b, axis);
      nextPositions[edge.index * 3 + axis] = edge.faces.length === 2
        ? (endpoints + facePoints[edge.faces[0] * 3 + axis] + facePoints[edge.faces[1] * 3 + axis]) * 0.25
        : endpoints * 0.5;
    }
  }
  nextPositions.set(facePoints, faceOffset * 3);

  const nextFaces: number[][] = [];
  for (let faceIndex = 0; faceIndex < faces.length; faceIndex += 1) {
    const face = faces[faceIndex];
    const currentEdges = faceEdges[faceIndex];
    const facePoint = faceOffset + faceIndex;
    for (let corner = 0; corner < face.length; corner += 1) {
      nextFaces.push([
        face[corner],
        currentEdges[corner].index,
        facePoint,
        currentEdges[(corner + face.length - 1) % face.length].index,
      ]);
    }
  }
  return { positions: nextPositions, faces: nextFaces };
}

function triangleLevel(mesh: TriangleMesh, scheme: "loop" | "linear", boundary: SubdivisionBoundary): TriangleMesh {
  const { positions, triangles } = mesh;
  const vertexCount = positions.length / 3;
  const edges = new Map<number, Edge>();
  const faceEdges: [Edge, Edge, Edge][] = [];
  for (let offset = 0, face = 0; offset < triangles.length; offset += 3, face += 1) {
    const a = triangles[offset]; const b = triangles[offset + 1]; const c = triangles[offset + 2];
    faceEdges.push([
      addEdge(edges, a, b, face, c, vertexCount),
      addEdge(edges, b, c, face, a, vertexCount),
      addEdge(edges, c, a, face, b, vertexCount),
    ]);
  }

  const neighbors = Array.from({ length: vertexCount }, () => [] as number[]);
  const boundaryNeighbors = Array.from({ length: vertexCount }, () => [] as number[]);
  let edgeOffset = vertexCount;
  for (const edge of edges.values()) {
    edge.index = edgeOffset;
    edgeOffset += 1;
    neighbors[edge.a].push(edge.b);
    neighbors[edge.b].push(edge.a);
    if (edge.faces.length !== 2) {
      boundaryNeighbors[edge.a].push(edge.b);
      boundaryNeighbors[edge.b].push(edge.a);
    }
  }

  const nextPositions = new Float32Array(edgeOffset * 3);
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    for (let axis = 0; axis < 3; axis += 1) {
      const source = coordinate(positions, vertex, axis);
      if (scheme === "linear") {
        nextPositions[vertex * 3 + axis] = source;
      } else if (boundaryNeighbors[vertex].length) {
        nextPositions[vertex * 3 + axis] = boundaryPosition(positions, vertex, boundaryNeighbors[vertex], axis, boundary);
      } else {
        const adjacent = neighbors[vertex];
        const beta = adjacent.length === 3 ? 3 / 16 : 3 / (8 * Math.max(1, adjacent.length));
        let sum = 0;
        for (const neighbor of adjacent) sum += coordinate(positions, neighbor, axis);
        nextPositions[vertex * 3 + axis] = source * (1 - adjacent.length * beta) + sum * beta;
      }
    }
  }

  for (const edge of edges.values()) {
    for (let axis = 0; axis < 3; axis += 1) {
      const endpoints = coordinate(positions, edge.a, axis) + coordinate(positions, edge.b, axis);
      nextPositions[edge.index * 3 + axis] = scheme === "loop" && edge.opposites.length === 2
        ? endpoints * 3 / 8 + (coordinate(positions, edge.opposites[0], axis) + coordinate(positions, edge.opposites[1], axis)) / 8
        : endpoints * 0.5;
    }
  }

  const nextTriangles: number[] = [];
  for (let face = 0, offset = 0; offset < triangles.length; face += 1, offset += 3) {
    const a = triangles[offset]; const b = triangles[offset + 1]; const c = triangles[offset + 2];
    const [ab, bc, ca] = faceEdges[face].map((edge) => edge.index);
    nextTriangles.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca);
  }
  return { positions: nextPositions, triangles: nextTriangles };
}

export function subdivisionTriangleCount(triangles: number, scheme: SubdivisionScheme, levels: number) {
  if (levels <= 0) return triangles;
  return scheme === "catmull-clark"
    ? triangles * 6 * 4 ** (levels - 1)
    : triangles * 4 ** levels;
}

export function subdivideGeometry(
  input: BufferGeometry,
  scheme: SubdivisionScheme,
  levels: number,
  boundary: SubdivisionBoundary,
) {
  const welded = weldGeometryPositions(input, 1e-5);
  const sourcePosition = welded.getAttribute("position") as BufferAttribute;
  const sourceIndex = welded.index;
  if (!sourceIndex) {
    welded.dispose();
    throw new Error("Subdivision requires indexed triangle geometry.");
  }
  let positions: PositionArray = new Float32Array(sourcePosition.array as ArrayLike<number>);
  const sourceTriangles = Array.from(sourceIndex.array as ArrayLike<number>);
  welded.dispose();

  let triangles: number[];
  if (scheme === "catmull-clark") {
    let mesh: PolygonMesh = {
      positions,
      faces: Array.from({ length: sourceTriangles.length / 3 }, (_, face) => sourceTriangles.slice(face * 3, face * 3 + 3)),
    };
    for (let level = 0; level < levels; level += 1) mesh = catmullClarkLevel(mesh, boundary);
    positions = mesh.positions;
    triangles = [];
    for (const face of mesh.faces) {
      for (let corner = 1; corner < face.length - 1; corner += 1) triangles.push(face[0], face[corner], face[corner + 1]);
    }
  } else {
    let mesh: TriangleMesh = { positions, triangles: sourceTriangles };
    for (let level = 0; level < levels; level += 1) mesh = triangleLevel(mesh, scheme, boundary);
    positions = mesh.positions;
    triangles = mesh.triangles;
  }

  const output = new BufferGeometry();
  output.setAttribute("position", new BufferAttribute(positions, 3));
  output.setIndex(triangles);
  output.computeVertexNormals();
  output.computeBoundingBox();
  output.computeBoundingSphere();
  return output;
}
