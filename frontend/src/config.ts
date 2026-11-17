export const config = {
  graphqlUrl: import.meta.env.VITE_APPSYNC_URL as string,
  realtimeUrl: import.meta.env.VITE_APPSYNC_REALTIME_URL as string,
  // AppSync API keys are public client identifiers (like a Firebase key), used for throttling.
  // For per-user access control, switch AppSync auth to Amazon Cognito (see docs/iam-security.md).
  apiKey: import.meta.env.VITE_APPSYNC_API_KEY as string,
};

export const isConfigured = Boolean(config.graphqlUrl && config.realtimeUrl && config.apiKey);
