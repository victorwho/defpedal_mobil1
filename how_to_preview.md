# How to Preview Your App

When you are building your app locally in the `development` sandbox, the fastest and best way to see your changes is to preview the app on your own computer. You don't need to save your changes to GitHub or Google AI Studio just to see how they look!

Because your app is built using React and Vite, it comes with a built-in local server that updates automatically.

## The Local Preview Method (Recommended)

1. **Open your terminal** in Cursor, VS Code, or your command line program. Make sure you are in your project folder (`defpedal5`).
2. **Install dependencies** (if you haven't recently):
   ```bash
   npm install
   ```
3. **Start the local development server** by running:
   ```bash
   npm run dev
   ```
4. **Open the app in your browser.** The terminal will display a local URL, usually `http://localhost:5173`. 
   *   Hold **Ctrl** (or Cmd on Mac) and click the link to open it automatically.
   *   Alternatively, copy and paste the URL into your browser.

## Why this is the best way to work:

*   **Instant Updates (Hot Reloading):** As you or your AI helpers (like Antigravity) make changes to the code and save the files, your browser tab will instantly refresh to show the new changes.
*   **Catch Mistakes Early:** You can immediately see what works and what is broken *before* you save the code to your `development` branch on GitHub.
*   **The Workflow:**
    1.  Tell your AI helper what to build.
    2.  The AI writes and saves the code.
    3.  Look at your `http://localhost:5173` browser tab to see how it looks.
    4.  If it looks good, save (commit) the changes and push them to GitHub!

*(Note: While Google AI Studio is great for quick prototyping of single components or ideas, it might struggle to accurately preview a full React app with multiple files. The local `npm run dev` method is your primary workspace).*
