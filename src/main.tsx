import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./app/App";
import { AuthProvider } from "./features/auth/AuthProvider";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <HashRouter>
        <App />
      </HashRouter>
    </AuthProvider>
  </React.StrictMode>
);
