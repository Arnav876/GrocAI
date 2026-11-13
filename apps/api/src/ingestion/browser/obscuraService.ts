import { spawn, ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import http from "http";
import { chromium, Browser, BrowserContext, Page } from "playwright";

export interface ObscuraConfig {
  binPath?: string;
  port?: number;
  host?: string;
  stealth?: boolean;
  allowPrivateNetwork?: boolean;
  autoStart?: boolean;
}

export interface ObscuraStatus {
  available: boolean;
  running: boolean;
  managed: boolean;
  pid?: number;
  cdpUrl: string;
  version?: {
    Browser?: string;
    "Protocol-Version"?: string;
    "User-Agent"?: string;
    "V8-Version"?: string;
    webSocketDebuggerUrl?: string;
  } | null;
  binPath?: string | null;
}

export class ObscuraService {
  private config: Required<ObscuraConfig>;
  private process: ChildProcess | null = null;
  private managedBrowser: Browser | null = null;
  private isShuttingDown = false;

  constructor(config: ObscuraConfig = {}) {
    this.config = {
      binPath: config.binPath || process.env.OBSCURA_BIN_PATH || "",
      port: config.port || Number(process.env.OBSCURA_PORT) || 9222,
      host: config.host || process.env.OBSCURA_HOST || "127.0.0.1",
      stealth: config.stealth ?? true,
      allowPrivateNetwork: config.allowPrivateNetwork ?? true,
      autoStart: config.autoStart ?? true,
    };

    // Clean up process if Node exits
    this.registerExitHooks();
  }

  resolveBinPath(): string | null {
    if (this.config.binPath && fs.existsSync(this.config.binPath)) {
      return path.resolve(this.config.binPath);
    }

    const candidates = [
      path.resolve(process.cwd(), "tools/obscura/obscura"),
      path.resolve(process.cwd(), "../../tools/obscura/obscura"),
      path.resolve(process.cwd(), "../tools/obscura/obscura"),
      typeof __dirname !== "undefined"
        ? path.resolve(__dirname, "../../../../../tools/obscura/obscura")
        : null,
      typeof __dirname !== "undefined"
        ? path.resolve(__dirname, "../../../../tools/obscura/obscura")
        : null,
    ].filter((p): p is string => Boolean(p));

    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        return path.resolve(cand);
      }
    }

    return null;
  }

  getCdpUrl(): string {
    return `http://${this.config.host}:${this.config.port}`;
  }

  async isHealthy(): Promise<boolean> {
    const version = await this.getVersion();
    return version !== null;
  }

  async getVersion(): Promise<Record<string, unknown> | null> {
    const url = `${this.getCdpUrl()}/json/version`;
    return new Promise((resolve) => {
      const req = http.get(url, { timeout: 1500 }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return resolve(null);
        }
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(null);
          }
        });
      });

      req.on("error", () => resolve(null));
      req.on("timeout", () => {
        req.destroy();
        resolve(null);
      });
    });
  }

  async start(): Promise<{ cdpUrl: string; managed: boolean }> {
    const cdpUrl = this.getCdpUrl();

    // 1. If already responding, reuse existing instance
    if (await this.isHealthy()) {
      return { cdpUrl, managed: this.process !== null };
    }

    if (!this.config.autoStart) {
      throw new Error(`Obscura is not running at ${cdpUrl} and autoStart is false.`);
    }

    const bin = this.resolveBinPath();
    if (!bin) {
      throw new Error(
        `Obscura binary not found. Please verify tools/obscura/obscura exists or set OBSCURA_BIN_PATH.`
      );
    }

    const args = ["serve", "-p", String(this.config.port), "--host", this.config.host];
    if (this.config.stealth) args.push("--stealth");
    if (this.config.allowPrivateNetwork) args.push("--allow-private-network");

    console.info(`[ObscuraService] Spawning Obscura daemon: ${bin} ${args.join(" ")}`);

    const child = spawn(bin, args, {
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    });

    child.stdout?.on("data", (d) => {
      const line = d.toString().trim();
      if (line && process.env.OBSCURA_LOGS === "true") {
        console.debug(`[Obscura STDOUT] ${line}`);
      }
    });

    child.stderr?.on("data", (d) => {
      const line = d.toString().trim();
      if (line && process.env.OBSCURA_LOGS === "true") {
        console.warn(`[Obscura STDERR] ${line}`);
      }
    });

    child.on("exit", (code, signal) => {
      if (!this.isShuttingDown && signal !== "SIGTERM" && signal !== "SIGINT") {
        console.warn(`[ObscuraService] Obscura exited unexpectedly: code=${code}, signal=${signal}`);
      }
      this.process = null;
    });

    this.process = child;

    // Poll until healthy or timed out (up to 6 seconds)
    const maxRetries = 30;
    for (let i = 0; i < maxRetries; i++) {
      await new Promise((r) => setTimeout(r, 200));
      if (await this.isHealthy()) {
        console.info(`[ObscuraService] Obscura successfully started and ready at ${cdpUrl}`);
        return { cdpUrl, managed: true };
      }
    }

    this.stop();
    throw new Error(`Obscura daemon failed to become healthy at ${cdpUrl} within 6 seconds.`);
  }

  async stop(): Promise<void> {
    this.isShuttingDown = true;
    if (this.managedBrowser) {
      try {
        await this.managedBrowser.close();
      } catch {
        // ignore
      }
      this.managedBrowser = null;
    }

    if (this.process && this.process.pid) {
      try {
        this.process.kill("SIGTERM");
      } catch {
        // ignore
      }
      this.process = null;
    }
    this.isShuttingDown = false;
  }

  async getStatus(): Promise<ObscuraStatus> {
    const bin = this.resolveBinPath();
    const version = await this.getVersion();
    const running = version !== null;

    return {
      available: bin !== null,
      running,
      managed: this.process !== null,
      pid: this.process?.pid,
      cdpUrl: this.getCdpUrl(),
      version: version as ObscuraStatus["version"],
      binPath: bin,
    };
  }

  async connectPlaywright(): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
    await this.start();
    const browser = await chromium.connectOverCDP(this.getCdpUrl());
    this.managedBrowser = browser;

    const contexts = browser.contexts();
    const context = contexts.length > 0 ? contexts[0] : await browser.newContext();
    const pages = context.pages();
    const page = pages.length > 0 ? pages[0] : await context.newPage();

    return { browser, context, page };
  }

  async scrapePage(
    url: string,
    options: {
      timeout?: number;
      evaluate?: string;
      waitUntil?: "load" | "domcontentloaded" | "networkidle";
    } = {}
  ): Promise<{ title: string; content: string; status: number; durationMs: number }> {
    const start = Date.now();
    const { browser, page } = await this.connectPlaywright();

    try {
      const resp = await page.goto(url, {
        waitUntil: options.waitUntil || "domcontentloaded",
        timeout: options.timeout || 30000,
      });

      const title = await page.title();
      let content = "";
      if (options.evaluate) {
        content = String(await page.evaluate(options.evaluate));
      } else {
        content = (await page.textContent("body")) || "";
      }

      const durationMs = Date.now() - start;
      return {
        title,
        content: content.trim(),
        status: resp?.status() || 200,
        durationMs,
      };
    } finally {
      await page.close().catch(() => {});
      await browser.close().catch(() => {});
    }
  }

  private registerExitHooks(): void {
    const cleanup = () => {
      if (this.process) {
        try {
          this.process.kill("SIGTERM");
        } catch {
          // ignore
        }
        this.process = null;
      }
    };

    process.once("exit", cleanup);
    process.once("SIGINT", cleanup);
    process.once("SIGTERM", cleanup);
  }
}

export const obscuraService = new ObscuraService();
