/**
 * Self-check for the broker client (cloud-mode auth + refresh) without a real
 * gRPC mini. Stands up a mock broker over HTTP and asserts the SDK exchanges
 * creds correctly, surfaces broker errors, and schedules refresh at ~80% TTL.
 * Run: `bun run src/skyline.check.ts`.
 */
import { strict as assert } from "node:assert/strict";
import { Broker, BrokerError } from "./broker";

interface CapturedRequest {
  body: unknown;
  path: string;
}
const requests: CapturedRequest[] = [];
const lastRequest = (): CapturedRequest | undefined => requests.at(-1);
let mode: "ok" | "denied" = "ok";

const server = Bun.serve({
  async fetch(req) {
    const url = new URL(req.url);
    requests.push({ body: await req.json(), path: url.pathname });
    if (mode === "denied") {
      return Response.json(
        {
          error: {
            code: 2006,
            doc_url: "https://docs.interactions.co.in/errors/codes/2006",
            message: "no",
            slug: "PLATFORM_NOT_ENABLED",
          },
          succeed: false,
          trace_id: "testtrace",
        },
        { status: 403 }
      );
    }
    return Response.json({
      data: {
        endpoints: [{ address: "100.1.2.3:50051", phone: "+15551230000" }],
        token: "rt.signed.jwt",
        ttl: 600,
      },
      succeed: true,
    });
  },
  port: 0,
});

const baseUrl = `http://127.0.0.1:${server.port}`;
const broker = new Broker({ baseUrl });

// 1. Cloud-mode resolve: sends creds+platform, returns lines with the token.
{
  const out = await broker.resolve(
    { projectId: "proj_x", projectSecret: "sk_y" },
    "imessage",
    "iMessage;-;+15551230000"
  );
  assert.equal(out.token, "rt.signed.jwt");
  assert.equal(out.ttl, 600);
  assert.equal(out.lines.length, 1);
  assert.equal(out.lines[0].address, "100.1.2.3:50051");
  assert.equal(out.lines[0].phone, "+15551230000");
  assert.equal(out.lines[0].token, "rt.signed.jwt");
  // The request carried exactly the broker contract.
  assert.deepEqual(lastRequest()?.body, {
    platform: "imessage",
    projectId: "proj_x",
    projectSecret: "sk_y",
    space: "iMessage;-;+15551230000",
  });
  assert.equal(lastRequest()?.path, "/v1/auth/token");
}

// 2. Entitlement / auth failure surfaces as a typed BrokerError with the code.
{
  mode = "denied";
  let threw: unknown;
  try {
    await broker.resolve({ projectId: "p", projectSecret: "s" }, "whatsapp");
  } catch (e) {
    threw = e;
  }
  assert.ok(threw instanceof BrokerError, "should throw BrokerError");
  assert.equal((threw as BrokerError).code, "PLATFORM_NOT_ENABLED");
  assert.equal((threw as BrokerError).status, 403);
  mode = "ok";
}

// 3. Refresh schedules at ~80% of TTL and fires.
{
  const fired = await new Promise<boolean>((resolve) => {
    // 0.05s TTL → refresh ~40ms; allow generous margin.
    broker.scheduleRefresh(0.05, () => resolve(true));
    setTimeout(() => resolve(false), 500);
  });
  assert.equal(fired, true, "refresh callback should fire");
}

// 4. cancelRefresh prevents a pending refresh from firing.
{
  let fired = false;
  broker.scheduleRefresh(0.05, () => {
    fired = true;
  });
  broker.cancelRefresh();
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(fired, false, "cancelled refresh must not fire");
}

server.stop(true);
console.log("skyline.check: all assertions passed");
