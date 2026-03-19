import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import posthog from "posthog-js";
import App from "../mtg-proxy-generator.jsx";

posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
  api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
  person_profiles: "identified_only",
});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
