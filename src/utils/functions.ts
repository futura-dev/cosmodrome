import {spawnSync} from 'child_process'
import {ParamsOf} from './types'

export const controlledSpawn = (...params: ParamsOf<typeof spawnSync>) => {
  const output = spawnSync(...params)
  if (output.status !== 0) {
    console.log(output.error)
    console.log(output.stdout?.toString() ?? '')
    console.log(output)
    throw new Error(output.stderr.toString())
  }

  return output.stdout.toString()
}
