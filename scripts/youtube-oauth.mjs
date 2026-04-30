import http from "node:http";
import process from "node:process";
import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

const clientId = process.env.YOUTUBE_CLIENT_ID;
const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
const port = Number(process.env.OAUTH_PORT || 53682);
const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;

const scopes = [
  "https://www.googleapis.com/auth/youtube.force-ssl",
];

if (!clientId || !clientSecret) {
  console.error("Missing YOUTUBE_CLIENT_ID or YOUTUBE_CLIENT_SECRET in .env");
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", redirectUri);

  if (url.pathname !== "/oauth2callback") {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const error = url.searchParams.get("error");
  if (error) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end(`OAuth error: ${error}`);
    console.error(`OAuth error: ${error}`);
    server.close();
    return;
  }

  const code = url.searchParams.get("code");
  if (!code) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Missing OAuth code");
    console.error("Missing OAuth code");
    server.close();
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.refresh_token) {
      throw new Error("Google did not return a refresh token. Revoke this app's access in your Google Account, then run this script again.");
    }

    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Authorization complete. You can close this tab and return to your terminal.");

    console.log("");
    console.log("Add this to your .env:");
    console.log(`YOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}`);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Failed to exchange authorization code. See terminal output.");
    console.error(err instanceof Error ? err.message : err);
  } finally {
    server.close();
  }
});

server.listen(port, "127.0.0.1", () => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    include_granted_scopes: true,
    prompt: "consent",
    scope: scopes,
  });

  console.log("Open this URL in your browser, then approve access:");
  console.log("");
  console.log(authUrl);
  console.log("");
  console.log(`Waiting for Google to redirect back to ${redirectUri}`);
});
