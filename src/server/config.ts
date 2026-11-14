export type StorageConfig =
  | { driver: "local"; uploadsDir: string }
  | {
      driver: "s3";
      bucket: string;
      region: string;
      endpoint?: string;
      accessKeyId?: string;
      secretAccessKey?: string;
    };

export type Config = {
  databaseUrl: string;
  /** Externally visible origin (KTD13); undefined means "use the request origin". */
  publicUrl?: string;
  cookieSecure: boolean;
  trustedProxyCount: number;
  storage: StorageConfig;
};

type Env = Record<string, string | undefined>;

function fail(message: string): never {
  throw new Error(`Invalid configuration: ${message}`);
}

function read(env: Env, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

export function parseConfig(env: Env): Config {
  const databaseUrl = read(env, "DATABASE_URL") ?? "file:/data/kindwords.db";
  if (!/^(file:|postgres:\/\/|postgresql:\/\/)/.test(databaseUrl)) {
    fail("DATABASE_URL must start with file: (SQLite) or postgres:// (Postgres).");
  }

  let publicUrl: string | undefined;
  const rawPublicUrl = read(env, "PUBLIC_URL");
  if (rawPublicUrl) {
    let url: URL;
    try {
      url = new URL(rawPublicUrl);
    } catch {
      fail(`PUBLIC_URL "${rawPublicUrl}" must be an absolute URL such as https://reviews.example.com.`);
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      fail(`PUBLIC_URL "${rawPublicUrl}" must start with http:// or https://.`);
    }
    publicUrl = url.origin;
  }

  const rawProxyCount = read(env, "TRUSTED_PROXY_COUNT") ?? "0";
  if (!/^\d+$/.test(rawProxyCount)) {
    fail(`TRUSTED_PROXY_COUNT "${rawProxyCount}" must be a whole number of 0 or more.`);
  }

  const driver = read(env, "STORAGE_DRIVER") ?? "local";
  let storage: StorageConfig;
  if (driver === "local") {
    storage = { driver, uploadsDir: read(env, "UPLOADS_DIR") ?? "/data/uploads" };
  } else if (driver === "s3") {
    const bucket = read(env, "S3_BUCKET") ?? fail("STORAGE_DRIVER=s3 requires S3_BUCKET.");
    const accessKeyId = read(env, "S3_ACCESS_KEY_ID");
    const secretAccessKey = read(env, "S3_SECRET_ACCESS_KEY");
    if (!accessKeyId !== !secretAccessKey) {
      fail("S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be set together.");
    }
    storage = {
      driver,
      bucket,
      region: read(env, "S3_REGION") ?? "us-east-1",
      endpoint: read(env, "S3_ENDPOINT"),
      accessKeyId,
      secretAccessKey,
    };
  } else {
    fail(`STORAGE_DRIVER "${driver}" must be "local" or "s3".`);
  }

  return {
    databaseUrl,
    publicUrl,
    cookieSecure: publicUrl?.startsWith("https:") ?? false,
    trustedProxyCount: Number(rawProxyCount),
    storage,
  };
}

let cached: Config | undefined;

/** Parses process.env once; throws a readable error on invalid settings. */
export function getConfig(): Config {
  if (!cached) {
    cached = parseConfig(process.env);
    if (!cached.publicUrl) {
      console.warn("PUBLIC_URL is not set; links and embed code will use the request origin.");
    }
  }
  return cached;
}
