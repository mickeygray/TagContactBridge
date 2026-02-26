const RC = require("@ringcentral/sdk").SDK;

const RINGOUT_CALLER = "+18773622426";
const RECIPIENT_NUMBER = "3106665997";
const SERVER_URL = "https://platform.ringcentral.com";
const CLIENT_ID = "8Wv8kvb9UUWb8U3D4YKjBh";
const CLIENT_SECRET = "21oUbxtl5qBdaOlYyz14z1Y1I5JNZazxwcrCWPFAWkzl";
const JWT_TOKEN =
  "eyJraWQiOiI4NzYyZjU5OGQwNTk0NGRiODZiZjVjYTk3ODA0NzYwOCIsInR5cCI6IkpXVCIsImFsZyI6IlJTMjU2In0.eyJhdWQiOiJodHRwczovL3BsYXRmb3JtLnJpbmdjZW50cmFsLmNvbS9yZXN0YXBpL29hdXRoL3Rva2VuIiwic3ViIjoiNjM3MzAwMzUwMDQiLCJpc3MiOiJodHRwczovL3BsYXRmb3JtLnJpbmdjZW50cmFsLmNvbSIsImV4cCI6MzkxODg1NTY1OSwiaWF0IjoxNzcxMzcyMDEyLCJqdGkiOiIyazcwVkh0R1I0bTk1dWowaTBoNk53In0.GRagGwVrn1hFLZO0SzuHWppHcWEfRkeGroG_ALpB3mtuHa-QhzE4ERJWJ4djeoD3k5Qf7ppz_fU2ahuJU21Ik_ttt_yY4rew9bmtazjJuTpap4AggjqjeRWl-WlJfLsOGMePECHMP4Y2HRZvPTYLD_A2Ds8KSoFPgBC1vdQrn4Em4zRXgbyMUfeatvxih2kL336OUEHeC9vS1zbRU9CTaAFGG-6pdBIaaaagGDg9Ok5ulbZnOVw395f3jOncohp4XlK6OHQAhhbHuY_3GstZboqIykvvyzAgfHSEZW2LejKtHGgtymaT9EJf2esiN9OGf7a8EMrBYbvpY56RvSuvJw";

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
