/** Role-scoped onboarding: an invite code selects the persona server-side, never the client. */
const { timingSafeEqual } = require("node:crypto");

const ROLES = {
  title: {
    label: "Title / Settlement",
    persona: "TITLE_VENDOR",
    codeEnv: "INVITE_TITLE",
    userEnv: "BYTE_TITLE_USERNAME",
    secretEnv: "BYTE_TITLE_SECRET_ARN"
  },
  broker: {
    label: "TPO / Broker",
    persona: "TPO_BROKER",
    codeEnv: "INVITE_BROKER",
    userEnv: "BYTE_BROKER_USERNAME",
    secretEnv: "BYTE_BROKER_SECRET_ARN"
  },
  appraisal: {
    label: "AMC / Appraisal",
    persona: "AMC_VENDOR",
    codeEnv: "INVITE_APPRAISAL",
    userEnv: "BYTE_APPRAISAL_USERNAME",
    secretEnv: "BYTE_APPRAISAL_SECRET_ARN"
  }
};

const safeEqual = (a, b) => {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
};

/** Fails closed unless both the role and its invite code are configured. */
const roleFor = (env, role) => {
  const config = ROLES[role];
  const code = config && env[config.codeEnv];
  return config && code ? { ...config, role, code } : null;
};

module.exports = { ROLES, roleFor, safeEqual };
