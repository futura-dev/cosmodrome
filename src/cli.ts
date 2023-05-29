#! /usr/bin/env node

import { program } from "commander";
import { release } from "./commands/release";
import { init } from "./commands/init";
import * as process from "process";

// program definition
program
  .name("@futura-dev/cosmodrome")
  .description("Cosmodrome 🚀")
  .version(process.env.npm_package_version ?? "0.0.0");

// 'release' command definition
program
  .command("release")
  .option(
    "-c, --config <path>",
    "path to configuration file",
    "./.cosmodrome.json"
  )
  .action(async (...args: any[]) => {
    // parse and validate input
    const [{ config }] = args;
    // call the command
    await release({ config });
  });

// 'init' command definition
program.command("init").action(init);

// parse program
program.parse(process.argv);
