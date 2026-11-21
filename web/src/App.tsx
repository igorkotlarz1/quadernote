import { useEffect, useRef, useState } from "react";
import { LevelBar } from "./components/LevelBar";
import { Footer, LessonBar } from "./components/Lesson";
import { Masthead } from "./components/Masthead";
import { Review } from "./components/Review";
import { Sheet } from "./components/Sheet";
import { Tools } from "./components/Tools";
import { ToastProvider } from "./components/ui";
import { Verbs } from "./components/Verbs";
import { store } from "./lib/store";

export function App() {
  const week = useRef<HTMLDetailsElement>(null);
  const [levelFlash, setLevelFlash] = useState(0);
  const openWeek = () => { const t = week.current; if (t) { t.open = true; t.scrollIntoView({ behavior: "smooth", block: "start" }); } };

  // Start with the caret in the first empty Italian field, like the original app.
  useEffect(() => {
    const list = store.cur.entries;
    const target = list.find((e) => !e.it) || list[list.length - 1];
    // ...but never steal focus from a field the user (or a test) already clicked into.
    setTimeout(() => { if (document.activeElement === document.body) document.getElementById("it-" + target.id)?.focus(); }, 50);
  }, []);

  return (
    <ToastProvider>
      <div className="wrap">
        <LevelBar openWeek={openWeek} forceOpen={levelFlash} />
        <Masthead />
        <Review />
        <LessonBar />
        <Sheet />
        <Verbs />
        <Tools ref={week} onLevelImported={() => setLevelFlash((n) => n + 1)} />
        <Footer />
      </div>
    </ToastProvider>
  );
}
