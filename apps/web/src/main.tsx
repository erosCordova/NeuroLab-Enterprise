import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Platform from "./Platform";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode><Platform /></StrictMode>
);
