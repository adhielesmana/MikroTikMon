// Multi-provider Auth setup (Replit, Google OAuth, Local Admin)
import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as LocalStrategy } from "passport-local";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import bcrypt from "bcrypt";
import { storage } from "./storage";

// Check if running in Replit environment
const isReplitEnvironment = !!process.env.REPLIT_DOMAINS;

const getOidcConfig = memoize(
  async () => {
    if (!isReplitEnvironment) {
      throw new Error("OIDC config requested but not in Replit environment");
    }
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(
  claims: any,
) {
  await storage.upsertUser({
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  // Register universal serialize/deserialize handlers for all auth providers
  passport.serializeUser((user: any, cb) => cb(null, user));
  passport.deserializeUser((user: any, cb) => cb(null, user));

  // Only setup Replit Auth if in Replit environment
  if (isReplitEnvironment) {
    const config = await getOidcConfig();

    const verify: VerifyFunction = async (
      tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
      verified: passport.AuthenticateCallback
    ) => {
      const user = {};
      updateUserSession(user, tokens);
      await upsertUser(tokens.claims());
      verified(null, user);
    };

    for (const domain of process.env
      .REPLIT_DOMAINS!.split(",")) {
      const strategy = new Strategy(
        {
          name: `replitauth:${domain}`,
          config,
          scope: "openid email profile offline_access",
          callbackURL: `https://${domain}/api/callback`,
        },
        verify,
      );
      passport.use(strategy);
    }

    app.get("/api/login", (req, res, next) => {
      passport.authenticate(`replitauth:${req.hostname}`, {
        prompt: "login consent",
        scope: ["openid", "email", "profile", "offline_access"],
      })(req, res, next);
    });

    app.get("/api/callback", (req, res, next) => {
      passport.authenticate(`replitauth:${req.hostname}`, {
        successReturnToOrRedirect: "/",
        failureRedirect: "/api/login",
      })(req, res, next);
    });

    app.get("/api/logout", (req, res) => {
      req.logout(() => {
        res.redirect(
          client.buildEndSessionUrl(config, {
            client_id: process.env.REPL_ID!,
            post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
          }).href
        );
      });
    });
  } else {
    // Fallback: redirect /api/login to /login when Replit Auth is not available
    app.get("/api/login", (req, res) => {
      res.redirect("/login");
    });
  }

  // Always setup Google OAuth if configured
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    console.log("✓ Google OAuth configured");
    
    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || `${process.env.APP_URL || 'http://localhost:5000'}/api/auth/google/callback`,
    }, async (accessToken, refreshToken, profile, done) => {
      try {
        // Extract user info from Google profile
        const email = profile.emails?.[0]?.value || '';
        const firstName = profile.name?.givenName || '';
        const lastName = profile.name?.familyName || '';
        const profileImageUrl = profile.photos?.[0]?.value || '';
        
        // Upsert user in database
        await storage.upsertUser({
          id: profile.id,
          email,
          firstName,
          lastName,
          profileImageUrl,
        });
        
        const user = {
          id: profile.id,
          email,
          firstName,
          lastName,
          profileImageUrl,
        };
        
        done(null, user);
      } catch (error) {
        done(error);
      }
    }));

    // Google OAuth routes
    app.get("/api/auth/google", 
      passport.authenticate("google", { scope: ["profile", "email"] })
    );

    app.get("/api/auth/google/callback",
      passport.authenticate("google", { failureRedirect: "/api/login" }),
      (req, res) => {
        res.redirect("/");
      }
    );
  }

  // Always setup local admin authentication with default credentials
  const DEFAULT_ADMIN_ID = "super-admin-001";
  const DEFAULT_ADMIN_USERNAME = "admin";
  // Pre-hashed password for "admin" (bcrypt hash)
  const DEFAULT_ADMIN_PASSWORD_HASH = "$2b$10$cMvOUlC.MTj7ynM.j/JyMu4IfHEsTjHYTTJBNAmTklFZ9wxTUJP1O";
  
  console.log("✓ Default admin account enabled (username: admin, password: admin)");
  console.log("⚠️  You will be forced to change the password on first login");
  
  passport.use(new LocalStrategy({
    usernameField: 'username',
    passwordField: 'password'
  }, async (username, password, done) => {
    try {
      // Check if this is a local admin user
      const dbUser = await storage.getUserByEmail(`${username}@local`);
      
      if (dbUser && dbUser.passwordHash) {
        // User has custom password - verify against their stored hash
        const passwordMatch = await bcrypt.compare(password, dbUser.passwordHash);
        
        if (passwordMatch) {
          const user = {
            id: dbUser.id,
            email: dbUser.email,
            firstName: dbUser.firstName,
            lastName: dbUser.lastName,
            role: dbUser.role,
            mustChangePassword: dbUser.mustChangePassword,
          };
          
          return done(null, user);
        }
      } else if (username === DEFAULT_ADMIN_USERNAME) {
        // First-time login with default credentials
        const passwordMatch = await bcrypt.compare(password, DEFAULT_ADMIN_PASSWORD_HASH);
        
        if (passwordMatch) {
          // Create/update default admin user with mustChangePassword flag
          await storage.upsertUser({
            id: DEFAULT_ADMIN_ID,
            email: `${DEFAULT_ADMIN_USERNAME}@local`,
            firstName: "Admin",
            lastName: "User",
            profileImageUrl: "",
            passwordHash: DEFAULT_ADMIN_PASSWORD_HASH,
            mustChangePassword: true,
          });
          
          // Force admin role and enabled status
          await storage.updateUser(DEFAULT_ADMIN_ID, { 
            role: "admin",
            enabled: true,
            mustChangePassword: true,
          });
          
          const user = {
            id: DEFAULT_ADMIN_ID,
            email: `${DEFAULT_ADMIN_USERNAME}@local`,
            firstName: "Admin",
            lastName: "User",
            role: "admin",
            mustChangePassword: true,
          };
          
          return done(null, user);
        }
      }
      
      return done(null, false, { message: "Invalid credentials" });
    } catch (error) {
      return done(error);
    }
  }));

  // Local admin login routes
  app.post("/api/auth/local/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) {
        return res.status(500).json({ message: "Authentication error" });
      }
      if (!user) {
        return res.status(401).json({ message: info?.message || "Invalid credentials" });
      }
      req.logIn(user, (err) => {
        if (err) {
          return res.status(500).json({ message: "Login error" });
        }
        return res.json({ 
          message: "Login successful",
          mustChangePassword: user.mustChangePassword || false,
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
          }
        });
      });
    })(req, res, next);
  });
  
  // Password change endpoint for local admin users
  app.post("/api/auth/change-password", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    const userId = (req.user as any)?.id;
    const { currentPassword, newPassword, newUsername } = req.body;
    
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ message: "New password must be at least 8 characters" });
    }
    
    try {
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Verify current password
      if (!user.passwordHash) {
        return res.status(400).json({ message: "Password change not allowed for this user" });
      }
      
      const passwordMatch = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!passwordMatch) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }
      
      // Hash new password
      const newPasswordHash = await bcrypt.hash(newPassword, 10);
      
      // Update user
      const updates: any = {
        passwordHash: newPasswordHash,
        mustChangePassword: false,
      };
      
      // Update username/email if provided
      if (newUsername && newUsername !== user.email?.split('@')[0]) {
        updates.email = `${newUsername}@local`;
        updates.firstName = newUsername.charAt(0).toUpperCase() + newUsername.slice(1);
      }
      
      await storage.updateUser(userId, updates);
      
      // Update session
      (req.user as any).mustChangePassword = false;
      if (updates.email) {
        (req.user as any).email = updates.email;
        (req.user as any).firstName = updates.firstName;
      }
      
      return res.json({ 
        message: "Password changed successfully",
        user: {
          id: userId,
          email: updates.email || user.email,
          firstName: updates.firstName || user.firstName,
          lastName: user.lastName,
        }
      });
    } catch (error) {
      console.error("Password change error:", error);
      return res.status(500).json({ message: "Failed to change password" });
    }
  });

  // Unified logout endpoint
  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      if (isReplitEnvironment) {
        // Redirect to Replit logout
        const config = getOidcConfig();
        config.then(c => {
          res.redirect(
            client.buildEndSessionUrl(c, {
              client_id: process.env.REPL_ID!,
              post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
            }).href
          );
        }).catch(() => {
          res.redirect("/");
        });
      } else {
        res.redirect("/");
      }
    });
  });

  // Auth status endpoint
  app.get("/api/auth/status", (req, res) => {
    res.json({
      authenticated: req.isAuthenticated(),
      providers: {
        replit: isReplitEnvironment,
        google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
        local: !!process.env.SUPER_ADMIN_PASSWORD,
      },
      user: req.isAuthenticated() ? {
        id: (req.user as any)?.id,
        email: (req.user as any)?.email,
        firstName: (req.user as any)?.firstName,
        lastName: (req.user as any)?.lastName,
      } : null
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  // Check if user is authenticated via any provider
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const user = req.user as any;

  // For Google OAuth and Local auth, no token refresh needed
  const SUPER_ADMIN_ID = "super-admin-001";
  if (user.id && (user.id === SUPER_ADMIN_ID || user.id.startsWith('1'))) {
    return next();
  }

  // For Replit Auth, handle token refresh
  if (isReplitEnvironment && user.expires_at) {
    const now = Math.floor(Date.now() / 1000);
    if (now <= user.expires_at) {
      return next();
    }

    const refreshToken = user.refresh_token;
    if (!refreshToken) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    try {
      const config = await getOidcConfig();
      const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
      updateUserSession(user, tokenResponse);
      return next();
    } catch (error) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
  }

  // Default: allow if authenticated
  return next();
};

// Middleware to check if user is admin
export const isAdmin: RequestHandler = async (req, res, next) => {
  const userId = (req.user as any)?.id || (req.user as any)?.claims?.sub;
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const user = await storage.getUser(userId);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden: Admin access required" });
  }

  next();
};

// Middleware to check if user is enabled
export const isEnabled: RequestHandler = async (req, res, next) => {
  const userId = (req.user as any)?.id || (req.user as any)?.claims?.sub;
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const user = await storage.getUser(userId);
  if (!user || !user.enabled) {
    return res.status(403).json({ message: "Forbidden: Account not enabled" });
  }

  next();
};
