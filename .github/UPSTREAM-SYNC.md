# Upstream synchronization

`vamshisaideep9/client1` is a standalone private repository, so GitHub's **Sync
fork** action is unavailable. `brollysolutions/client1` remains the public source.

After `sync-upstream-main.yml` reaches the destination's default `main` branch,
**Open upstream sync PR** checks at minutes 17 and 47 of each hour. GitHub may
delay scheduled runs. **Actions → Open upstream sync PR → Run workflow** on
`main` provides a manual check. The workflow skips every other repository and
branch, including upstream. It requires no local computer or new dependency.

The existing destination Actions secret `SYNC_PAT` authenticates branch pushes
and PR creation. Its value is never copied into source. It must have destination
repository Contents and Pull requests write access, plus permission to update
workflow files when those are included in the source changes. Existing secret
presence and successful historical main-to-prod runs do not establish that all
these permissions remain available. Missing, expired or insufficient credentials
fail the workflow; there is no fallback or gate bypass.

A PAT allows the ordinary PR workflows to run for automation-created PRs; see
[GitHub's workflow trigger guidance](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).
The workflow uses the existing official checkout action pinned to v4.2.2's
commit, without persistent checkout credentials. Only the sync step receives
the PAT. It does not execute code from the incoming source tree.

When upstream has new commits, the job prepares a dedicated branch containing
both current histories and opens a PR against destination `main`. It preserves
destination-only commits and stops if the merge conflicts. It never force-pushes,
writes `main`/`prod`, merges or approves PRs, or changes checks. Existing open sync
PRs are left for review; the next run after merging checks the latest source.
A deliberately closed PR is not recreated for the identical source/base pair.
If a branch push succeeded but PR creation failed, retrying reuses that branch
only after verifying that it contains both snapshots.

Review sync PRs and their normal CI/security checks, then use **Create a merge
commit** to retain upstream ancestry. Failed checks remain failures. Existing
main-to-prod automation can run after the merge; this setup does not change that
policy or its credentials. Resolve conflicts on a review branch rather than
resetting or force-pushing the destination. Disable this workflow in Actions to
stop new sync PRs.

Initial activation is destination [PR #4](https://github.com/vamshisaideep9/client1/pull/4),
which includes merged upstream PR #297 and this setup. The local approval hook
rejected the explicitly requested merge on 12 September 2026, so configuration
in that open PR is **not yet an active scheduled job**. After merging, inspect
the first manual/scheduled terminal result to verify the existing PAT's access.
