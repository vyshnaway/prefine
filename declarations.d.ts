declare module "marchingsquares" {
  export function isoContours(
    grid: number[][],
    level: number,
    options?: {
      polygons?: boolean;
      noFrame?: boolean;
      verbose?: boolean;
    }
  ): number[][][];
  export function isoBands(
    grid: number[][],
    lowerLevel: number,
    upperLevel: number,
    options?: {
      polygons?: boolean;
      noFrame?: boolean;
      verbose?: boolean;
    }
  ): number[][][];
}

declare module "chaikin-smooth" {
  export default function chaikinSmooth(
    input: number[][],
    output?: number[][]
  ): number[][];
}
