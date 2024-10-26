import { z } from "zod";

export const cosmodrome_config_schema = z.object({
  preReleasePrefix: z.string(),
  releaseCommitPrefix: z.string(),
  git: z.object({
    authorEmail: z.string(),
    authorUsername: z.string()
  }),
  github: z.optional(
    z.object({
      owner: z.string(),
      repo: z.string(),
      token: z.string()
    })
  )
});
