import {z} from 'zod'

export const cosmodrome_config_schema = z.object({
  "github": z.optional(
    z.object({
      "owner": z.string(),
      "repo": z.string(),
      "token": z.string()
    })
  )
})
