import { z } from "zod";
import { SCORE_CAVEAT } from "../types/scoring.js";
import type { MethodologySection } from "../types/methodology.js";
import type { UfoeService } from "./service.js";

export const getMethodologyInput = {
  section: z
    .enum(["overview", "scores", "effects", "probative_factor", "weights", "case_lab", "all"])
    .default("all"),
};

export async function getMethodology(service: UfoeService, input: z.infer<z.ZodObject<typeof getMethodologyInput>>) {
  const methodology = await service.getMethodology(input.section as MethodologySection);
  return {
    ...methodology,
    caveat: SCORE_CAVEAT,
  };
}
