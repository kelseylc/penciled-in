/** Friendly, human-readable labels for IANA timezone strings. */

export function zoneCity(zone: string): string {
  const last = zone.split("/").pop() ?? zone;
  return last.replace(/_/g, " ");
}

/** Current UTC offset for a zone, e.g. "GMT-4" or "GMT+5:30". */
export function zoneOffset(zone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      timeZoneName: "shortOffset",
    }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}

/** "New York — GMT-4" */
export function zoneLabel(zone: string): string {
  const offset = zoneOffset(zone);
  return offset ? `${zoneCity(zone)} — ${offset}` : zoneCity(zone);
}

/** Long descriptive name, e.g. "Eastern Daylight Time". */
export function zoneLongName(zone: string): string {
  try {
    return (
      new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "long" })
        .formatToParts(new Date())
        .find((p) => p.type === "timeZoneName")?.value ?? zone
    );
  } catch {
    return zone;
  }
}

export function allZones(fallback: string): string[] {
  const list = Intl.supportedValuesOf?.("timeZone") ?? [fallback];
  return list.filter((z) => z.includes("/"));
}

export function searchZones(query: string, fallback: string, limit = 60): string[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, "_");
  const zones = allZones(fallback);
  if (!q) return zones.slice(0, limit);
  return zones.filter((z) => z.toLowerCase().includes(q)).slice(0, limit);
}
