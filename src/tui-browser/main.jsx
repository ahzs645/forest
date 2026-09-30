import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { theme } from "../../js/theme.js";
import "./styles.css";

// The colour theme picked under Settings on the main site applies here too.
theme.apply();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
