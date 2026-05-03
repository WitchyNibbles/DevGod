export interface InstallOptions {
  sourceRoot: string;
  targetRoot: string;
}

export interface InstallSummary {
  created: string[];
  updated: string[];
  skipped: string[];
  backups: string[];
}
