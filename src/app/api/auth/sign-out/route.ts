import { revokeCurrentSession } from "@/lib/server/session";

export async function POST(): Promise<Response> {
  await revokeCurrentSession();

  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}