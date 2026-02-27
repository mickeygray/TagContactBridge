// UNUSED — RingCentral test script, never imported by the application.
// Kept for reference; may be useful for future RingCentral debugging.
/*
const RC = require("@ringcentral/sdk").SDK;

const RINGOUT_CALLER = "+18773622426";
const RECIPIENT_NUMBER = "3106665997";
const SERVER_URL = "https://platform.ringcentral.com";
const CLIENT_ID = "8Wv8kvb9UUWb8U3D4YKjBh";
const CLIENT_SECRET = "REDACTED";
const JWT_TOKEN = "REDACTED";

var rcsdk = new RC({
  server: SERVER_URL,
  clientId: CLIENT_ID,
  clientSecret: CLIENT_SECRET,
});

var platform = rcsdk.platform();

platform.login({
  jwt: JWT_TOKEN,
});

platform.on(platform.events.loginSuccess, () => {
  call_ringout();
});

async function call_ringout() {
  try {
    var resp = await platform.post(
      "/restapi/v1.0/account/~/extension/~/ring-out",
      {
        from: { phoneNumber: RINGOUT_CALLER },
        to: { phoneNumber: RECIPIENT_NUMBER },
        playPrompt: false,
      },
    );
    var jsonObj = await resp.json();
    console.log("Call placed. Call status: " + jsonObj.status.callStatus);
  } catch (e) {
    console.log(e.message);
  }
}
*/
