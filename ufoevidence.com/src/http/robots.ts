import { UfoeToolError } from "../types/errors.js";

type RobotsRule = {
  userAgent: string;
  disallow: string[];
  allow: string[];
};

export function parseRobotsTxt(text: string): RobotsRule[] {
  const rules: RobotsRule[] = [];
  let current: RobotsRule | undefined;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    if (!line) continue;
    const [rawKey, ...rest] = line.split(":");
    const key = rawKey?.trim().toLowerCase();
    const value = rest.join(":").trim();

    if (key === "user-agent") {
      current = { userAgent: value.toLowerCase(), disallow: [], allow: [] };
      rules.push(current);
    } else if (key === "disallow" && current) {
      current.disallow.push(value);
    } else if (key === "allow" && current) {
      current.allow.push(value);
    }
  }

  return rules;
}

export function isAllowedByRobots(targetUrl: string, robotsText: string, userAgent: string): boolean {
  const path = new URL(targetUrl).pathname;
  const lowerAgent = userAgent.toLowerCase();
  const matching = parseRobotsTxt(robotsText).filter(
    (rule) => rule.userAgent === "*" || lowerAgent.includes(rule.userAgent),
  );

  let bestMatch: { type: "allow" | "disallow"; path: string } | undefined;
  for (const rule of matching) {
    for (const allow of rule.allow) {
      if (allow && path.startsWith(allow) && (!bestMatch || allow.length > bestMatch.path.length)) {
        bestMatch = { type: "allow", path: allow };
      }
    }
    for (const disallow of rule.disallow) {
      if (!disallow) continue;
      if (path.startsWith(disallow) && (!bestMatch || disallow.length > bestMatch.path.length)) {
        bestMatch = { type: "disallow", path: disallow };
      }
    }
  }

  return bestMatch?.type !== "disallow";
}

export async function assertRobotsAllowed(
  fetchText: (url: string) => Promise<string>,
  targetUrl: string,
  userAgent: string,
): Promise<void> {
  const parsed = new URL(targetUrl);
  const robotsUrl = `${parsed.origin}/robots.txt`;

  try {
    const robotsText = await fetchText(robotsUrl);
    if (!isAllowedByRobots(targetUrl, robotsText, userAgent)) {
      throw new UfoeToolError("UNSUPPORTED", `robots.txt disallows fetching ${targetUrl}`, targetUrl);
    }
  } catch (error) {
    if (error instanceof UfoeToolError) throw error;
    // If robots.txt is missing or unavailable, continue with low-rate read-only fetching.
  }
}
