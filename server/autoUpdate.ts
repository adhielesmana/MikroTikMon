import cron from "node-cron";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Check for updates every 5 minutes
const UPDATE_CHECK_INTERVAL = "*/5 * * * *"; // Every 5 minutes

let isUpdating = false;

async function checkForUpdates(): Promise<void> {
  if (isUpdating) {
    console.log("[Auto-Update] Update already in progress, skipping...");
    return;
  }

  try {
    isUpdating = true;
    console.log("[Auto-Update] Checking for updates from GitHub...");

    // Fetch latest from remote
    await execAsync("git fetch origin");

    // Check if local branch is behind remote
    const { stdout: localCommit } = await execAsync("git rev-parse HEAD");
    const { stdout: remoteCommit } = await execAsync("git rev-parse @{u}");

    const local = localCommit.trim();
    const remote = remoteCommit.trim();

    if (local === remote) {
      console.log("[Auto-Update] ✅ Already up to date");
      return;
    }

    console.log("[Auto-Update] 🔄 Updates available!");
    console.log(`[Auto-Update] Local:  ${local.substring(0, 7)}`);
    console.log(`[Auto-Update] Remote: ${remote.substring(0, 7)}`);

    // Pull changes
    console.log("[Auto-Update] Pulling changes from GitHub...");
    const { stdout: pullOutput } = await execAsync("git pull origin main || git pull origin master");
    console.log("[Auto-Update] Pull output:", pullOutput.trim());

    // Check if package.json was updated
    const { stdout: changedFiles } = await execAsync("git diff --name-only HEAD@{1} HEAD");
    const filesChanged = changedFiles.trim().split("\n");

    if (filesChanged.includes("package.json")) {
      console.log("[Auto-Update] 📦 package.json changed, installing dependencies...");
      const { stdout: npmOutput } = await execAsync("npm install");
      console.log("[Auto-Update] Dependencies installed");
    }

    console.log("[Auto-Update] ✅ Update completed successfully!");
    console.log("[Auto-Update] 🔄 Application will restart automatically...");

    // For Docker: container will restart automatically if configured with --restart policy
    // For PM2: uncomment the line below
    // await execAsync("pm2 restart all");
    
    // For Replit: file changes will trigger auto-restart
    // For systemd: uncomment the line below
    // await execAsync("sudo systemctl restart your-service-name");

    // Exit process to trigger restart (Docker/PM2/systemd will restart it)
    setTimeout(() => {
      console.log("[Auto-Update] Exiting to trigger restart...");
      process.exit(0);
    }, 2000);

  } catch (error: any) {
    console.error("[Auto-Update] ❌ Error:", error.message);
  } finally {
    isUpdating = false;
  }
}

export function startAutoUpdate(): void {
  console.log(`[Auto-Update] Starting automatic update checker (every 5 minutes)...`);
  
  // Check immediately on startup
  setTimeout(() => checkForUpdates(), 10000); // Wait 10 seconds after startup
  
  // Then check every 5 minutes
  cron.schedule(UPDATE_CHECK_INTERVAL, () => {
    checkForUpdates();
  });
  
  console.log("[Auto-Update] Auto-update service started ✅");
}
