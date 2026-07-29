import * as React from "react";

import { getAgentsReport } from "@/lib/reports-api";
import { toIsoDateIST } from "@/lib/reports";

export type AgentOption = { id: string; label: string };

const FIVE_YEARS_MS = 5 * 365 * 24 * 60 * 60 * 1000;

// FR-16.2's "isolate ... a group of agents" is satisfied by a list of ids in
// one query param -- no new search endpoint was added for it. The agents
// report itself already returns {agent_profile_uuid, agent_code, agent_name}
// for every agent active in a date range, so the filter bar's multi-select
// is populated from one wide, fixed 5-year lookback (independent of
// whatever date range the report itself is currently filtered to) rather
// than a bespoke lookup endpoint.
export function useAgentOptions(businessLine?: string) {
  const [options, setOptions] = React.useState<AgentOption[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    const now = new Date();
    const from = new Date(now.getTime() - FIVE_YEARS_MS);
    void getAgentsReport({
      dateFrom: toIsoDateIST(from),
      dateTo: toIsoDateIST(now),
      businessLine,
      sortBy: "agent_code",
      sortDir: "asc",
      limit: 500,
    }).then((res) => {
      if (!active) return;
      if (res.ok) {
        setOptions(
          res.data.rows.map((r) => ({
            id: r.agent_profile_uuid,
            label: `${r.agent_name} (${r.agent_code})`,
          })),
        );
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [businessLine]);

  return { options, loading };
}
