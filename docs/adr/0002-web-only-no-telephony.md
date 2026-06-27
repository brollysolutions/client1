# ADR-0002: Web-only scope; cloud telephony and number masking removed

- **Status:** Accepted
- **Date:** 2026-06-26
- **Deciders:** Client, Project Lead
- **Source:** SRS v1.2 §5.2, §5.7; Telecaller system design §1.1

## Context

Earlier drafts assumed native apps and integrated cloud telephony (bridged virtual number,
server-side masking, automatic call logs via webhook, call recording).

## Decision

Deliver a responsive **web application only** (no native Android/iOS). Remove cloud telephony
entirely: Telecallers dial leads **directly** from their own devices via a click-to-dial link to
the native dialer. Consequently:

- Lead numbers are shown **unmasked** to the assigned Telecaller and to the owning Agent (FR-15).
- There is **no automatic call log** — outcomes are logged manually as `lead_activities` rows.
- No call recording, DLT/consent prompts, or bridge dependency at the platform level.

## Consequences

- The field-visibility `mobile`/telecaller masking toggle is moot (still governs other fields).
- WhatsApp follow-up remains via `wa.me` links (non-telephony channel).
- Reinstating masked click-to-call / logging / recording later is a **separate scope item** and
  would restore true masking.

## Alternatives considered

- **Integrated telephony (Exotel/Ozonetel/Knowlarity)** — enables masking + auto logs but adds
  cost, DLT compliance, and integration scope. Deferred out of base scope.
