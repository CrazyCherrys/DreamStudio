declare module 'playwright' {
  export const chromium: {
    launch(options: { executablePath?: string; headless?: boolean }): Promise<{
      close(): Promise<void>;
      newPage(): Promise<{
        getByLabel(text: string): { fill(value: string): Promise<void> };
        getByRole(role: string, options: { name: string }): { click(): Promise<void> };
        getByText(text: string): { waitFor(options?: { timeout?: number }): Promise<void> };
        goto(url: string, options?: { waitUntil?: string }): Promise<unknown>;
        waitForURL(url: string, options?: { timeout?: number }): Promise<void>;
      }>;
    }>;
  };
}
