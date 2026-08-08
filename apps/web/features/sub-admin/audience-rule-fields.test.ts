import { describe, expect, it } from "vitest";

import {
  audienceSummary,
  emptyAudienceRules,
  normalizeAudienceRules,
  withAgentSignals,
  withClientJourneyStages,
} from "./audience-rule-fields";

describe("audience rule helpers", () => {
  it("keeps a generated-contract-compatible generic rule shape", () => {
    expect(emptyAudienceRules()).toEqual({
      version: 1,
      user_types: [],
      client_journey_stages: [],
      agent_signals: [],
      locations: [],
    });
    expect(audienceSummary(emptyAudienceRules())).toBe("Everyone");
  });

  it("summarizes targeted dimensions without exposing coordinates", () => {
    const rules = normalizeAudienceRules({
      version: 1,
      user_types: ["client"],
      client_journey_stages: ["in_progress", "on_hold"],
      locations: [
        { label: "Hyderabad", latitude: 17.39, longitude: 78.49, radius_km: 25 },
      ],
    });

    expect(audienceSummary(rules)).toBe("Clients · 2 workflow signals · 1 area");
    expect(audienceSummary(rules)).not.toContain("17.39");
  });

  it("describes a role-only shared audience", () => {
    expect(
      audienceSummary({ version: 1, user_types: ["client", "agent"] }),
    ).toBe("Clients + Agents");
  });

  it("keeps role-specific workflow dimensions mutually exclusive", () => {
    const shared = emptyAudienceRules();
    shared.user_types = ["client", "agent"];
    const clientRules = withClientJourneyStages(shared, ["in_progress"]);
    expect(clientRules.user_types).toEqual(["client"]);
    expect(clientRules.agent_signals).toEqual([]);

    const agentRules = withAgentSignals(clientRules, ["has_active_leads"]);
    expect(agentRules.user_types).toEqual(["agent"]);
    expect(agentRules.client_journey_stages).toEqual([]);
  });
});
