export const PRINT_MATERIAL_PRESETS = [
  { id: "pla-orange", label: "PLA · Printa orange", color: "#ff5d2e", roughness: 0.42, metalness: 0.02, clearcoat: 0.22, transmission: 0 },
  { id: "pla-matte", label: "Matte PLA · Bone", color: "#e6dfcf", roughness: 0.78, metalness: 0, clearcoat: 0.04, transmission: 0 },
  { id: "pla-silk", label: "Silk PLA · Violet", color: "#7458d8", roughness: 0.2, metalness: 0.42, clearcoat: 0.55, transmission: 0 },
  { id: "petg", label: "PETG · Ice blue", color: "#78c7dd", roughness: 0.16, metalness: 0, clearcoat: 0.62, transmission: 0.18 },
  { id: "resin", label: "Resin · Amber", color: "#d98b32", roughness: 0.12, metalness: 0, clearcoat: 0.7, transmission: 0.32 },
] as const;

export type PrintMaterialPreset = typeof PRINT_MATERIAL_PRESETS[number]["id"];

export function printMaterialPreset(id: string) {
  return PRINT_MATERIAL_PRESETS.find((preset) => preset.id === id) ?? PRINT_MATERIAL_PRESETS[0];
}
