import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { installChunkReloadGuard, markBooted } from "./lib/bootRecovery";
import "./index.css";

installChunkReloadGuard();
createRoot(document.getElementById("root")!).render(<App />);
markBooted();
