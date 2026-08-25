import type { TableRule } from "./mode";

/**
 * How many people (DM included) have to be in for a session to run.
 *
 * "Play anyway" is the default because the alternative is how campaigns die:
 * one player out, nobody plays, three weeks pass, the campaign is over.
 */
export function quorumForTableRule(rule: TableRule, partySize: number): number {
  const size = Math.max(1, partySize);
  if (rule === "everyone") return size;
  if (rule === "strict_quorum") return Math.min(size, Math.max(2, Math.ceil(size * 0.6)));
  // DM + 2 players, but never more than the table.
  return Math.min(size, 3);
}

export function describeTableRule(rule: TableRule, quorum: number, partySize: number): string {
  if (rule === "everyone") return `All ${partySize} of you have to be in.`;
  if (rule === "strict_quorum") return `${quorum} of ${partySize} have to be in, including the DM.`;
  return `We play with ${quorum}+ at the table, as long as the DM's there.`;
}

/** Health of a campaign, from the gap since the last played session. */
export type CampaignHealth = "healthy" | "slipping" | "at_risk" | "dormant";

export function campaignHealth(daysSinceLastPlayed: number | null): CampaignHealth {
  if (daysSinceLastPlayed === null) return "healthy";
  if (daysSinceLastPlayed >= 60) return "dormant";
  if (daysSinceLastPlayed >= 35) return "at_risk";
  if (daysSinceLastPlayed >= 21) return "slipping";
  return "healthy";
}

export function healthLabel(health: CampaignHealth, days: number | null): string {
  if (days === null) return "No sessions played yet";
  if (health === "dormant") return `Dormant — ${days} days since you last played`;
  if (health === "at_risk") return `At risk — ${days} days since you last played`;
  if (health === "slipping") return `Slipping — ${days} days since you last played`;
  return `${days} days since you last played`;
}

export const CADENCE_LABELS: Record<string, string> = {
  weekly: "Weekly",
  biweekly: "Every other week",
  monthly: "Monthly",
  quarterly: "Quarterly",
  adhoc: "Ad hoc (one-off)",
};
