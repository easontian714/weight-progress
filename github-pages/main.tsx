import React from "react";
import { createRoot } from "react-dom/client";
import { WeightTracker } from "../app/weight-tracker";
import "../app/globals.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WeightTracker />
  </React.StrictMode>,
);
