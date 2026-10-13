import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { initInstall } from "./pwa/install";
import { registerServiceWorker } from "./pwa/register";
import { App } from "./ui/App";
import "./ui/styles.css";

// Both must start before the first render: the browser fires the install prompt early.
initInstall();
registerServiceWorker();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
