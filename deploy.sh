#!/usr/bin/env bash
# One-line AWS CloudShell installer for the BytePro Enterprise Cloud gateway.
# Usage: bash <(curl -sSL https://raw.githubusercontent.com/Spuds0588/BytePro-Enterprise-Cloud-API-Passthrough-Middleware-Gateway/main/deploy.sh)
set -euo pipefail

STACK_NAME="${STACK_NAME:-BytePro-Mortgage-Gateway}"
AWS_REGION="${AWS_REGION:-us-east-1}"
TEMPLATE_URL="${TEMPLATE_URL:-https://raw.githubusercontent.com/Spuds0588/BytePro-Enterprise-Cloud-API-Passthrough-Middleware-Gateway/main/template.yaml}"

command -v aws >/dev/null || { echo "AWS CLI is required. Run this in AWS CloudShell." >&2; exit 1; }
aws sts get-caller-identity >/dev/null || { echo "No AWS session. Sign in first." >&2; exit 1; }

read -r -p "BytePro API base URL [https://api.bytesoftware.com/api/v1]: " BYTE_BASE_URL
BYTE_BASE_URL="${BYTE_BASE_URL:-https://api.bytesoftware.com/api/v1}"
read -r -p "BytePro lender account code: " BYTE_ACCOUNT_CODE
for ROLE in TITLE BROKER APPRAISAL; do
  read -r -p "BytePro ${ROLE} service-account username: " "${ROLE}_USERNAME"
  read -r -s -p "BytePro ${ROLE} service-account password: " "${ROLE}_PASSWORD"
  echo
done

code() { openssl rand -hex 24 2>/dev/null || head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n'; }
TITLE_INVITE_CODE="${TITLE_INVITE_CODE:-$(code)}"
BROKER_INVITE_CODE="${BROKER_INVITE_CODE:-$(code)}"
APPRAISAL_INVITE_CODE="${APPRAISAL_INVITE_CODE:-$(code)}"

TEMPLATE_FILE="$(mktemp)"
trap 'rm -f "$TEMPLATE_FILE"' EXIT
curl -sSL "$TEMPLATE_URL" -o "$TEMPLATE_FILE"

aws cloudformation deploy \
  --stack-name "$STACK_NAME" \
  --template-file "$TEMPLATE_FILE" \
  --capabilities CAPABILITY_IAM \
  --region "$AWS_REGION" \
  --parameter-overrides \
    "ByteBaseUrl=$BYTE_BASE_URL" \
    "ByteAccountCode=$BYTE_ACCOUNT_CODE" \
    "TitleUsername=$TITLE_USERNAME" "TitlePassword=$TITLE_PASSWORD" \
    "BrokerUsername=$BROKER_USERNAME" "BrokerPassword=$BROKER_PASSWORD" \
    "AppraisalUsername=$APPRAISAL_USERNAME" "AppraisalPassword=$APPRAISAL_PASSWORD" \
    TitleInviteCode="$TITLE_INVITE_CODE" \
    "BrokerInviteCode=$BROKER_INVITE_CODE" \
    "AppraisalInviteCode=$APPRAISAL_INVITE_CODE"

outputs() { aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$AWS_REGION" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
GATEWAY_URL="$(outputs GatewayUrl)"
PORTAL_URL="$(outputs AdminPortalUrl)"
EGRESS_IP="$(outputs StaticEgressIp)"

cat <<EOF

Deployed: $STACK_NAME ($AWS_REGION)

  Gateway:      $GATEWAY_URL
  Portal:       $PORTAL_URL
  Health:       $GATEWAY_URL/health
  Egress IP:    $EGRESS_IP   <-- allowlist this with Byte Software

Share one invite link per partner role:
  Title:        $PORTAL_URL?role=title&code=$TITLE_INVITE_CODE
  Broker:       $PORTAL_URL?role=broker&code=$BROKER_INVITE_CODE
  Appraisal:    $PORTAL_URL?role=appraisal&code=$APPRAISAL_INVITE_CODE

Smoke test:
  curl -s "$GATEWAY_URL/health"
  KEY=<apiKey returned by the portal>
  curl -s "$GATEWAY_URL/v1/loans/BYTE-1002948?paths=Property,Loan,Milestones" -H "x-api-key: \$KEY"

Invite codes are bearer secrets. Rotate them with a stack update if a link leaks.
EOF
