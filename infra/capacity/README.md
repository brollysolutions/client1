# 4-GB production capacity rehearsal

Status: **operator execution required; configuration alone does not prove capacity**

This runbook validates the complete production topology on the approved
2-vCPU / 4-GB Ubuntu 24.04 `linux/amd64` host. PostgreSQL, Redis, ClamAV,
PgBouncer, the isolated FFmpeg runtime, API, scheduler, web, and nginx all
remain enabled. Managed uploads keep their existing private quarantine,
malware-scan, sanitize/transcode, and ready-only publication boundary.

The repository supplies conservative defaults, a serialized signature-update
procedure, and a privacy-minimized evidence gate. A named operator and a
different named reviewer must still execute and approve the rehearsal on the
exact host. Do not put credentials, request bodies, customer values, object
keys, database rows, raw logs, or screenshots containing PII in Git, a PR,
an issue, or chat.

## Compact resource budget

[`4gb.env.example`](4gb.env.example) mirrors the defaults in
[`docker-compose.prod.example.yml`](../../docker-compose.prod.example.yml).
They are ordinary Compose substitutions, so a larger future host can override
them without deleting ClamAV, FFmpeg, or an upload path.

| Service | Memory ceiling |
| --- | ---: |
| PostgreSQL | 352 MiB |
| Redis | 64 MiB, with 32 MiB data cap and `noeviction` |
| ClamAV | 1,408 MiB |
| PgBouncer | 32 MiB |
| Isolated FFmpeg runtime | 768 MiB |
| API | 384 MiB |
| Scheduler | 224 MiB |
| Web | 224 MiB |
| nginx | 32 MiB |
| **Total container ceilings** | **3,488 MiB** |

The remaining nominal memory belongs to the kernel, Docker, filesystem cache,
and host agents. A ceiling is not a reservation and this arithmetic is not a
pass: the gate also requires at least 512 MiB `MemAvailable` throughout the
measured workload and no meaningful swap dependence.

The compact defaults additionally enforce:

- one Uvicorn worker, a 64-request concurrency/backlog boundary, and at most
  two concurrent Argon2 operations;
- API and scheduler SQLAlchemy pools of three plus two overflow connections,
  behind a ten-connection PgBouncer server pool and forty PostgreSQL slots;
- one operational scheduler job at a time while the independent heartbeat
  continues to prove liveness;
- one scan/sanitize operation per API or scheduler process and one managed
  video per scheduler tick, bounding object bytes before they enter memory;
- one ClamAV scan thread, two queued scans, a 21-MiB input/file boundary, a
  64-MiB expanded scan boundary, and alerts rather than silent partial scans
  when a file exceeds a scan limit;
- one isolated FFmpeg transcode at a time with the existing 768-MiB cgroup,
  one-CPU, PID, time, file, and address-space boundaries.

Do not reduce Argon2 cost, disable malware scanning, enable Redis eviction,
disable ClamAV `TestDatabases`, expose FFmpeg publicly, or increase upload limits
to make this rehearsal pass.

## 1. Prepare an isolated exact-host rehearsal

1. Freeze the candidate commit and all immutable image manifest digests.
2. Use the actual 2-vCPU / 4-GB Ubuntu 24.04 x64 droplet. A developer laptop,
   Docker Desktop VM, or a larger host with container limits is not equivalent.
3. Use synthetic accounts, synthetic documents, and a private rehearsal object
   prefix. Keep production data absent. Block payment, email, voice, push, and
   other external side effects.
4. Configure the same Docker Engine, filesystem, monitoring agent, firewall,
   TLS proxy, and secret-injection mechanism intended for launch.
5. Copy the production Compose example to the deployment location. Keep the
   compact defaults or load a reviewed copy of `4gb.env.example`; keep actual
   secrets in the approved secret store, never in that file.
6. Render and retain the exact configuration outside Git:

   ```bash
   docker compose --project-directory /opt/dhanadhara \
     -f /opt/dhanadhara/docker-compose.prod.yml config \
     > /restricted-evidence/capacity-compose.yml
   sha256sum /restricted-evidence/capacity-compose.yml
   ```

Inspect the retained render and confirm all nine services, immutable image
digests, memory ceilings, one API worker, one scheduler replica, ClamAV limits,
Redis `noeviction`, and private media network. The hash supplied to the checker
must come from this independently retained render, not the source template.

## 2. Install serialized ClamAV updates

The compact scanner does not run `freshclam` beside the resident engine. That
would duplicate the large signature working set. Schedule
[`scripts/update-clamav-db.sh`](../../scripts/update-clamav-db.sh) once daily
from the host. The script takes an exclusive lock, stops only ClamAV, runs a
one-shot update against the persistent signature volume with database testing
still enabled, restarts ClamAV even after an update failure, and waits for the
scanner ping.

Example systemd service (replace only the verified absolute deployment path):

```ini
[Unit]
Description=Dhanadhara serialized ClamAV signature update
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
ExecStart=/opt/dhanadhara/scripts/update-clamav-db.sh --compose-file /opt/dhanadhara/docker-compose.prod.yml
```

Example timer:

```ini
[Unit]
Description=Daily Dhanadhara ClamAV signature update

[Timer]
OnCalendar=*-*-* 02:15:00 UTC
RandomizedDelaySec=15m
Persistent=true

[Install]
WantedBy=timers.target
```

The scanner is briefly unavailable during an update. New upload confirmation
therefore fails closed or stays private; existing pages, API reads, database,
and already-ready media remain available. Alert on a failed timer, failed
scanner restart, or stale signature timestamp. A larger host may deliberately
set `CLAMAV_NO_FRESHCLAMD=false` and
`CLAMAV_CONCURRENT_DATABASE_RELOAD=yes`, but only after a new capacity and
security review and after disabling the host timer so two updaters cannot run.

## 3. Capture resource evidence

Start all services and wait until every healthcheck is healthy. Record, outside
Git, the candidate SHA, rendered-Compose SHA-256, start time, host
`/etc/os-release`, `uname -m`, logical CPU count, `/proc/meminfo`, and the
following per-container values before load:

```bash
docker inspect --format \
  '{{.Name}} {{.HostConfig.Memory}} {{.RestartCount}} {{.State.OOMKilled}} {{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' \
  $(docker compose -f /opt/dhanadhara/docker-compose.prod.yml ps -q)
```

Sample at least every five seconds for the complete run:

- host `MemTotal`, `MemAvailable`, `SwapTotal`, and `SwapFree`;
- `/proc/vmstat` `oom_kill` before and after;
- `docker stats --no-stream` memory and CPU for every service;
- container restart counts, OOM state, running state, and health;
- HTTP/API latency and error counts without paths containing user input,
  headers, cookies, bodies, or identifiers.

Retain raw metrics and logs in the restricted operations evidence store. The
JSON gate record contains only peaks, counts, booleans, timestamps, and opaque
evidence IDs.

## 4. Run the required workload

Keep metrics capture active for at least thirty minutes and exercise every
scenario below. Use only valid synthetic media produced for testing; do not
copy a real KYC document or customer record.

1. **Steady state:** keep all nine services healthy for thirty minutes.
2. **Authentication burst:** complete at least twenty password/OTP hash or
   verification operations with enough concurrency to prove the two-slot queue.
   Rate limits remain enabled; distribute approved synthetic cases rather than
   bypassing them.
3. **Image/PDF uploads:** process at least four allowed files including both
   formats and policy-maximum sizes. Confirm canonical objects alone become
   ready and metadata is removed where applicable.
4. **Malware rejection:** submit the standard harmless EICAR test fixture and
   confirm rejection with no usable/public object.
5. **Video processing:** process at least one valid policy-maximum 1920x1080
   H.264/AAC MP4 and confirm the canonical ready result.
6. **Scheduler cycle:** allow a real scheduler tick to claim and finish media
   while at least one other due operational job queues behind the global bound;
   confirm the heartbeat stays healthy.
7. **Database/web/API burst:** complete at least one hundred representative
   reads and bounded writes through nginx while health and RLS checks remain
   successful.
8. **ClamAV update:** run the serialized updater during the observation window,
   confirm upload failure is closed while the scanner is stopped, and confirm
   healthy scans resume with a tested, fresh signature database.
9. **Scanner outage:** stop only ClamAV and prove image/PDF confirmation and
   video readiness cannot succeed unscanned; then restore it.
10. **Media-processor outage:** stop only the isolated runtime and prove video
    stays private/retryable and never becomes ready; then restore it.

After load, repeat the container inspection. Any OOM kill, restart, unhealthy
service, missing workload, scan bypass, unexpected publication, kernel OOM,
less than 512 MiB minimum `MemAvailable`, more than 128 MiB peak swap use, or
aggregate configured container ceilings above 3,584 MiB is `NO-GO`.

## 5. Assess and approve

Copy [`capacity-evidence.example.json`](capacity-evidence.example.json) outside
the repository and replace every placeholder from reviewed measurements. The
operator and reviewer IDs must refer to distinct named people in the restricted
evidence system. Then run:

```bash
python scripts/check_capacity_evidence.py \
  --expected-candidate-sha "$RELEASE_CANDIDATE_SHA" \
  --expected-compose-sha256 "$RENDERED_COMPOSE_SHA256" \
  /restricted-evidence/capacity-evidence.json
```

Exit `0` and `"status": "PASS"` are both required. Exit `1` means a structurally
valid record is `NO-GO`; exit `2` means the input could not be safely parsed.
The assessor never echoes workload/evidence IDs and emits a binding record hash
only for a passing record.

A pass closes only the capacity evidence row for the exact candidate and
rendered topology. DNS/TLS, secrets, monitoring delivery, recovery, provider,
legal/privacy, payout, and final named GO/NO-GO gates remain separate. Changing
the droplet size, worker counts, connection pools, service limits, image
digests, upload policy, or monitoring footprint requires a new rehearsal.
