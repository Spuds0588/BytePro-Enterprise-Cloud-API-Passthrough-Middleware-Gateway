/** AWS adapters: DynamoDB tenants/sessions/jobs, SQS FIFO writes, Secrets Manager, API Gateway keys. */
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");
const { APIGatewayClient, CreateApiKeyCommand, AddKeyToUsagePlanCommand } = require("@aws-sdk/client-api-gateway");
const { randomBytes } = require("node:crypto");

const SECRET_TTL_MS = 5 * 60_000;

function createAwsStore(env = process.env) {
  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const sqs = new SQSClient({});
  const secrets = new SecretsManagerClient({});
  const apigw = new APIGatewayClient({});

  const secretsCache = new Map();
  const getItem = async (table, key) => (await ddb.send(new GetCommand({ TableName: table, Key: key })))?.Item ?? null;
  const putItem = (table, item) => ddb.send(new PutCommand({ TableName: table, Item: item }));
  const iso = () => new Date().toISOString();

  return {
    getSecret: async (id) => {
      const cached = secretsCache.get(id);
      if (cached && cached.expiresAt > Date.now()) return cached.value;
      const result = await secrets.send(new GetSecretValueCommand({ SecretId: id }));
      const value = result.SecretString ?? null;
      secretsCache.set(id, { value, expiresAt: Date.now() + SECRET_TTL_MS });
      return value;
    },

    getTenant: (apiKeyId) => getItem(env.TENANT_TABLE, { apiKeyId }),
    putTenant: (tenant) => putItem(env.TENANT_TABLE, tenant),

    getJob: (jobId) => getItem(env.JOB_TABLE, { jobId }),
    putJob: (job) => putItem(env.JOB_TABLE, job),

    getSession: (role) => getItem(env.SESSION_TABLE, { role }),
    putSession: async (session) => {
      await putItem(env.SESSION_TABLE, { ...session, updatedAt: iso() });
      return session;
    },

    enqueueWrite: async ({ jobId, loanId, kind, payload }) => {
      await sqs.send(
        new SendMessageCommand({
          QueueUrl: env.WRITE_QUEUE_URL,
          MessageGroupId: loanId,
          MessageDeduplicationId: jobId,
          MessageBody: JSON.stringify({ jobId, loanId, kind, payload })
        })
      );
    },

    createApiKey: async ({ tenantName }) => {
      const key = await apigw.send(
        new CreateApiKeyCommand({
          name: `${tenantName.slice(0, 40)}-${randomBytes(4).toString("hex")}`,
          description: "BytePro gateway vendor key (role-scoped invite provisioning)",
          enabled: true
        })
      );
      await apigw.send(new AddKeyToUsagePlanCommand({ usagePlanId: env.USAGE_PLAN_ID, keyId: key.id }));
      return { id: key.id, value: key.value };
    }
  };
}

module.exports = { createAwsStore };
