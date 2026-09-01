const LOCAL_API_BASE_URL = "http://localhost:8000";

export function resolveClientApiBaseUrl(
  publicBaseUrl: string | undefined,
  nodeEnv: string | undefined,
): string {
  const configured = publicBaseUrl?.trim();
  if (configured) return configured.replace(/\/$/, "");

  // Production's documented default is same-origin behind nginx. Development
  // and unit tests retain the host-published FastAPI port for local workflows.
  return nodeEnv === "production" ? "" : LOCAL_API_BASE_URL;
}
