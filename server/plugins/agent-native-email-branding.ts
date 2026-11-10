import { defineAppConfig } from "@agent-native/core/server";

export default defineAppConfig({
  app: {
    // This name appears in transactional emails. Change it to your product name.
    name: "Sun Home Agent Native",
    // The source template keeps a renamed app from inheriting first-party email branding.
    sourceTemplate: "content",
    // Keep the template's authenticated entry explicit after renaming the app.
    homePath: "/home",
    // Optional: use your own absolute HTTPS logo URL in transactional emails.
    // logoUrl: "https://example.com/logo.png",
  },
});
