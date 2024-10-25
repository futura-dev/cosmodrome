import * as fs from "fs";
import { Signale, SignaleOptions } from "signale";

const baseSignalOptions: SignaleOptions = {
  types: {
    complete: {
      badge: "**",
      color: "cyan",
      label: "completed"
    }
  },
  config: {
    displayScope: false
  }
};
const s = new Signale({
  ...baseSignalOptions,
  types: {
    ...baseSignalOptions.types,
    newline: { badge: "", label: "", color: "black" }
  }
});

export const init = (): Promise<void> => {
  fs.writeFileSync(
    "./.cosmodrome.json",
    JSON.stringify(
      {
        preReleasePrefix: "",
        releaseCommitPrefix: "",
        git: {
          authorEmail: "",
          authorUsername: ""
        },
        github: {
          owner: "",
          repo: "",
          token: ""
        }
        // eslint-disable-next-line comma-dangle
      },
      null,
      2
    )
  );
  s.complete(".cosmodrome.json file was successfully created");
  const gitignore = fs.readFileSync(".gitignore", { encoding: "utf8" });
  fs.writeFileSync(
    ".gitignore",
    gitignore + "\n# cosmodrome\n.cosmodrome.json\n",
    { flag: "w" }
  );
  s.complete("added .cosmodrome.json to .gitignore");
  // return
  return Promise.resolve();
};
