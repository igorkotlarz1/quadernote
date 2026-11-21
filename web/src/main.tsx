import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import { store } from "./lib/store";
import { sync } from "./lib/sync";
import { lexicon } from "./lib/lexicon";
import { reviews } from "./lib/reviews";

// Load the lessons from IndexedDB first, then start syncing, load the offline dictionary and the review log, and draw the app.
void store.init().then(() => {
  sync.start();
  void lexicon.start();
  void reviews.start();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
