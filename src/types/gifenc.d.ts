declare module "gifenc" {
  type EncoderOptions = {
    palette?: number[][];
    delay?: number;
    repeat?: number;
    transparent?: boolean;
    dispose?: number;
    first?: boolean;
  };
  export function GIFEncoder(): {
    writeFrame: (indexed: Uint8Array | Uint8ClampedArray, width: number, height: number, opts?: EncoderOptions) => void;
    finish: () => void;
    bytes: () => Uint8Array;
    bytesView: () => Uint8Array;
    reset: () => void;
  };
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number, opts?: unknown): number[][];
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: number[][], format?: string): Uint8Array;
}

declare module "gifenc/dist/gifenc.esm.js" {
  export * from "gifenc";
}