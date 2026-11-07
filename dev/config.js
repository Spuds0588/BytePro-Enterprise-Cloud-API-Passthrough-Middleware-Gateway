/** Shared local configuration for dev and tests. No secrets, no AWS. */
const { ACCOUNTS } = require("../mock/bytepro");

const INVITES = {
  title: "local-title-invite-0123456789",
  broker: "local-broker-invite-0123456789",
  appraisal: "local-appraisal-invite-0123456789"
};

const localEnv = (baseUrl = "http://127.0.0.1:3100") => ({
  BYTE_BASE_URL: baseUrl,
  BYTE_ACCOUNT_CODE: "BYTE-DEMO",
  BYTE_TITLE_USERNAME: ACCOUNTS.title.username,
  BYTE_BROKER_USERNAME: ACCOUNTS.broker.username,
  BYTE_APPRAISAL_USERNAME: ACCOUNTS.appraisal.username,
  BYTE_TITLE_SECRET_ARN: "local-title-password",
  BYTE_BROKER_SECRET_ARN: "local-broker-password",
  BYTE_APPRAISAL_SECRET_ARN: "local-appraisal-password",
  INVITE_TITLE: INVITES.title,
  INVITE_BROKER: INVITES.broker,
  INVITE_APPRAISAL: INVITES.appraisal
});

const seedSecrets = (store) => {
  for (const [role, account] of Object.entries(ACCOUNTS)) {
    store.setSecret(localEnv()[`BYTE_${role.toUpperCase()}_SECRET_ARN`], account.password);
  }
  return store;
};

module.exports = { INVITES, localEnv, seedSecrets };
