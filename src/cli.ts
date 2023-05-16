import { program } from 'commander'
import pj from './../package.json'
import {release} from './commands/release'
import {init} from './commands/init'

// program definition
program
  .name('@futura-dev/cosmodrome')
  .description('Cosmodrome 🚀')
  .version(pj.version)

// 'release' command definition
program
  .command('release')
  .option('-c, --config <path>', 'path to configuration file',  './.cosmodrome.json')
  .action(async (...args: any[]) => {
    // parse and validate input
    const [{ config }] = args;
    // call the command
    const res = await release({ config })
  })

// 'init' command definition
program
  .command('init')
  .action(init)

// parse program
program.parse(process.argv)
