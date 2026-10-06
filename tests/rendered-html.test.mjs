import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
}

test("server-renders the weight progress application", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>减重进度<\/title>/);
  assert.match(html, /记录每日体重/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("ships the shared-data and responsive product source", async () => {
  const [component, css, client] = await Promise.all([
    readFile(new URL("../app/weight-tracker.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../lib/supabase.ts", import.meta.url), "utf8"),
  ]);
  assert.match(component, /WEIGHT JOURNEY/);
  assert.match(component, /weight_entries/);
  assert.match(component, /weight_milestones/);
  assert.match(component, /计划与实际进度/);
  assert.match(component, /function RecentTrendChart/);
  assert.match(component, /function LongTermPlanChart/);
  assert.match(component, /visibleMilestones/);
  assert.match(component, /查看全部目标/);
  assert.match(component, /收起目标/);
  assert.match(component, /monthlyTicks/);
  assert.match(component, /className="panel long-plan"/);
  assert.match(component, /planDifferenceLabel/);
  assert.match(component, /deriveMilestone/);
  assert.match(component, /achievementAt/);
  assert.match(component, /计划已结束/);
  assert.match(component, /首次聚焦/);
  assert.match(component, /record-head/);
  assert.match(component, /achievement-badge/);
  assert.match(component, /当日达标/);
  assert.match(component, /milestone-edit-toggle/);
  assert.match(component, /未到时间/);
  assert.doesNotMatch(component, /useState\("90\.2"\)/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /\.long-plan/);
  assert.match(css, /\.milestone-toggle/);
  assert.match(css, /white-space:nowrap/);
  assert.match(css, /\.record-change/);
  assert.match(css, /\.lag\.positive/);
  assert.match(client, /sb_publishable_/);
  assert.doesNotMatch(client, /service_role/);
});
