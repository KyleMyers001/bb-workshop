import { describe, expect, it } from "vitest";
import { groupActivity } from "./activity";
import { thread } from "./fixtures.test-support";

describe("activity counts", () => {
  it("counts pending prompts before running, once per thread", () => {
    const waiting = thread({ id: "waiting", hasPendingInteraction: true });
    const running = thread({ id: "running" });
    expect(groupActivity([waiting, running])).toEqual({ running: [running], waiting: [waiting], errors: [] });
  });

  it("excludes archived and hidden threads", () => {
    expect(groupActivity([
      thread({ isArchived: true }), thread({ isHidden: true }),
      thread({ isHidden: true, hasPendingInteraction: true }),
    ])).toEqual({ running: [], waiting: [], errors: [] });
  });

  it("does not call idle, starting, stopping, offline or provisioning threads running", () => {
    const statuses = ["idle", "starting", "stopping", "pending"] as const;
    const threads = statuses.map(status => thread({ status, runtimeStatus: status }));
    threads.push(thread({ runtimeStatus: "waiting-for-host" }));
    threads.push(thread({ runtimeStatus: "provisioning" }));
    expect(groupActivity(threads)).toEqual({ running: [], waiting: [], errors: [] });
  });

  it("counts actual background work, but not an idle plan or persistent goal", () => {
    const background = thread({ status: "idle", runtimeStatus: "idle",
      activity: { workflows: 0, backgroundAgents: 1, backgroundCommands: 0, planMode: 0, goals: 0 } });
    const plan = thread({ status: "idle", runtimeStatus: "idle",
      activity: { workflows: 0, backgroundAgents: 0, backgroundCommands: 0, planMode: 1, goals: 1 } });
    expect(groupActivity([background, plan]).running).toEqual([background]);
  });

  it("separates failures and puts recent attention first", () => {
    const old = thread({ id: "old", hasPendingInteraction: true, latestAttentionAt: 10 });
    const recent = thread({ id: "new", hasPendingInteraction: true, latestAttentionAt: 20 });
    const error = thread({ id: "error", status: "error", runtimeStatus: "error" });
    const source = [old, recent, error];
    expect(groupActivity(source)).toEqual({ running: [], waiting: [recent, old], errors: [error] });
    expect(source).toEqual([old, recent, error]);
  });
});
