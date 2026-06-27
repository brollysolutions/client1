---
paths:
  - "docker-compose*.yml"
  - "**/Dockerfile"
  - "infra/docker/**"
---

# Docker Rules

- Do not place secrets in Dockerfiles or compose files.
- Use non-root users in production images.
- Use multi-stage builds.
- Add health checks for every service.
- Keep dev and prod commands separate.
- Do not use `docker compose down -v` without explicit approval.

Services: web, api, scheduler, worker (optional), postgres, redis, nginx (optional).
