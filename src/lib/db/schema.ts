import { boolean, index, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Better Auth core tables (user, session, account, verification)
// ---------------------------------------------------------------------------

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Hoops Hub tables
// ---------------------------------------------------------------------------

export const platformEnum = pgEnum("platform", ["sleeper", "yahoo", "espn"]);
export const connectionStatusEnum = pgEnum("connection_status", ["active", "needs_reconnect"]);

/**
 * A user's link to one platform account. `encryptedCredentials` holds the
 * AES-GCM encrypted JSON blob (Yahoo tokens, pasted ESPN espn_s2/SWID
 * cookies); null for Sleeper. Public ESPN leagues added by ID need no
 * connection row; see leaguePreference.
 * It is never selected into anything sent to the client.
 */
export const connection = pgTable(
  "connection",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    externalUserId: text("external_user_id").notNull(),
    displayName: text("display_name").notNull(),
    status: connectionStatusEnum("status").notNull().default("active"),
    encryptedCredentials: text("encrypted_credentials"),
    credentialsExpiresAt: timestamp("credentials_expires_at"),
    lastSyncedAt: timestamp("last_synced_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("connection_user_platform_ext_idx").on(t.userId, t.platform, t.externalUserId),
    index("connection_user_idx").on(t.userId),
  ],
);

/**
 * Leagues a user has explicitly added. Leagues discovered via listLeagues()
 * are shown by default; this lets users hide ones they don't care about and
 * add public ESPN leagues by id. Public ESPN leagues carry no user identity,
 * so the user picks their team and it is stored in myTeamExternalId.
 */
export const leaguePreference = pgTable(
  "league_preference",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    connectionId: text("connection_id").references(() => connection.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    externalLeagueId: text("external_league_id").notNull(),
    myTeamExternalId: text("my_team_external_id"),
    hidden: boolean("hidden").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("league_pref_user_platform_league_idx").on(t.userId, t.platform, t.externalLeagueId)],
);

/**
 * Hoops Hub's own watchlist (works across platforms; ESPN's own watchlist is
 * not synced). One row per user + platform + player.
 */
export const watchlist = pgTable(
  "watchlist",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    playerExternalId: text("player_external_id").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("watchlist_user_platform_player_idx").on(t.userId, t.platform, t.playerExternalId)],
);

/**
 * Browser push subscriptions (one per device). Keys are the browser's public
 * values for encrypting messages to it; nothing here is a secret of ours.
 */
export const pushSubscription = pgTable(
  "push_subscription",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("push_subscription_endpoint_idx").on(t.endpoint)],
);

/** Which alert types a user wants. Missing row = defaults (all on). */
export const alertSettings = pgTable("alert_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  tradeOffers: boolean("trade_offers").notNull().default(true),
  results: boolean("results").notNull().default(true),
  lineup: boolean("lineup").notNull().default(true),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** Alerts already sent, so each one goes out once. */
export const alertSent = pgTable(
  "alert_sent",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    sentAt: timestamp("sent_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("alert_sent_user_key_idx").on(t.userId, t.key)],
);
