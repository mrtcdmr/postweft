import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const current = join(homedir(), ".config/postweft");
const legacy = join(homedir(), ".config/social-autopilot");
const defaultHome = existsSync(join(legacy, "config.json")) && !existsSync(join(current, "config.json")) ? legacy : current;

export const HOME = process.env.POSTWEFT_HOME || process.env.SOCIAL_AUTOPILOT_HOME || defaultHome;
