import { handleApi } from "../../src/lib/server/routes";

/**
 * Cloudflare Pages Function for every request under /api. Provider secrets
 * reach it as environment variables of the Pages project.
 */
export const onRequest = (context: { request: Request; env: Record<string, unknown> }) =>
  handleApi(context.request, context.env);
