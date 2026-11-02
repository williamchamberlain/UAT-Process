

## 1. System Dependencies & Prerequisites

To run the app locally, two external tools must be installed on your machine:

1. **[Node.js](https://nodejs.org/) (v18+) & npm**
   * **Why it's needed:** Provides the JavaScript runtime and package manager required to install React libraries and run the Vite local development server.
2. **[Ollama](https://ollama.com/)**
   * **Why it's needed:** Serves as the local AI runtime. It runs the model on your machine's hardware with zero API keys and complete privacy.

### Platform Installation Instructions

#### macOS
* **Option A (GUI):** Download installers directly from [nodejs.org](https://nodejs.org/) and [ollama.com](https://ollama.com/).
* **Option B (Homebrew):**
  ```bash
  brew install node
  brew install --cask ollama
  ```

#### Windows
* **Option A (GUI):** Download the standard `.msi` / `.exe` setup files from [nodejs.org](https://nodejs.org/) and [ollama.com](https://ollama.com/).
* **Option B (winget / PowerShell):**
  ```powershell
  winget install OpenJS.NodeJS Ollama.Ollama
  ```

#### Linux (Debian / Ubuntu / Arch)
* **Debian/Ubuntu:**
  ```bash
  sudo apt update && sudo apt install -y nodejs npm
  curl -fsSL https://ollama.com/install.sh | sh
  ```
* **Arch Linux:**
  ```bash
  sudo pacman -S nodejs npm
  curl -fsSL https://ollama.com/install.sh | sh
  sudo systemctl enable --now ollama
  ```

---

## 2. Setting Up the AI Model

When testing the UAT app I have used **Qwen 2.5 (3B)** (`qwen2.5:3b`).

### Why Qwen 2.5 (3B)?
* **Speed:** Extremely low latency responses on consumer-grade hardware (including Apple Silicon and standard Intel/AMD laptops).



Once Ollama is installed and running in your background/system tray, pull the model from your terminal:

```bash
ollama pull qwen2.5:3b
```

---

## 3. Project Dependencies

The project itself relies on several npm packages defined in `package.json`:

* **`react` & `react-dom`:** Core UI component framework.
* **`vite` & `@vitejs/plugin-react`:** High-speed development server and build tool.
* **`tailwindcss` & `@tailwindcss/vite`:** Utility-first CSS styling engine.
* **`lucide-react`:** Icon library for dashboard navigation, clipper controls, and status indicators.

Install these dependencies by running:

```bash
cd sentinel-app
npm install
```

---

## 4. Running the Application

1. **Ensure Ollama is running:** Make sure Ollama is active (default endpoint: `http://localhost:11434`).
2. **Start the development server:**
   ```bash
   npm run dev
   ```
3. **Open the browser:** Click or navigate to the local server address displayed in your terminal (typically `http://localhost:5173`).

---

## 5. Application Modes

* **App 1 (User Feedback & 30s Clipper):**
  * Rolling 30-second screen replay buffer via standard browser `MediaRecorder` (`Alt + F10` shortcut).
  * Lenient, AI-assisted vagueness checks with 1-click contextual suggestions.
  * Adaptive forms that customize labels and severity options depending on whether you are submitting a bug or a feature suggestion.
* **App 2 (Engineering Cluster Console):**
  * Incremental, cached duplicate ticket scanner.
  * Grouped evidence inspector with automated Jira draft synthesis via Qwen.
