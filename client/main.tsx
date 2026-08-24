import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import "./activity.css";
import "./detail.css";
import "./detail-fields.css";
import "./dialogs.css";
import "./settings.css";
import "./table-controls.css";
import "./library-table.css";
import "./search.css";
import "./navigation.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
