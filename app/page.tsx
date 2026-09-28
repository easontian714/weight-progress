import type { Metadata } from "next";
import { WeightTracker } from "./weight-tracker";

export const metadata: Metadata = {
  title: "减重进度",
  description: "记录每日体重，对照每周节点，查看本轮减重计划的真实进度。",
};

export default function Home() {
  return <WeightTracker />;
}
