import assert from "node:assert/strict";
import test from "node:test";
import {achievementAt,deriveMilestone,planDifferenceLabel,plannedWeightAt} from "../lib/weight-calculations.ts";

const plan={startDate:"2026-09-01",startWeight:90.1,targetDate:"2026-12-31",targetWeight:80};
const entries=[{date:"2026-10-04",weight:88.7},{date:"2026-10-05",weight:88.9},{date:"2026-10-06",weight:86.7}];

test("difference copy never combines direction with a negative number",()=>{
  assert.equal(planDifferenceLabel(86.7,87.2),"当前低于计划体重 0.5 kg");
  assert.equal(planDifferenceLabel(87.7,87.2),"当前高于计划体重 0.5 kg");
  assert.equal(planDifferenceLabel(87.2,87.2),"当前正好达到计划体重");
});

test("milestones use the latest entry on or before their date",()=>{
  assert.deepEqual(deriveMilestone({date:"2026-10-05",target:87.3},entries,"2026-10-06"),{date:"2026-10-05",target:87.3,state:"missed",actual:88.9,referenceDate:"2026-10-05"});
  assert.equal(deriveMilestone({date:"2026-10-07",target:87.1},entries,"2026-10-06").state,"future");
  assert.equal(deriveMilestone({date:"2026-08-31",target:90.5},entries,"2026-10-06").state,"unrecorded");
});

test("daily achievement uses the rounded visible plan value",()=>{
  assert.equal(plannedWeightAt(plan,"2026-10-06"),87.2);
  assert.equal(achievementAt(86.7,"2026-10-06",plan),"achieved");
  assert.equal(achievementAt(90.1,"2026-08-31",plan),"outside-plan");
  assert.equal(achievementAt(80,"2027-01-01",plan),"achieved");
});
