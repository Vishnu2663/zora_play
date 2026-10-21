#!/usr/bin/env bash
# Deploys the Zora Play live-joke service: one Lambda (Node 20), an HTTP API in front of it, and a least-privilege role.
# Creates ONLY resources named zora-play-*. Safe to re-run (it updates what exists). Needs the AWS CLI with credentials.
#
#   export AWS_REGION=ap-south-1 GUARDRAIL_ID=<id> GUARDRAIL_VERSION=1
#   bash infra/joke-service/deploy.sh
set -euo pipefail
export MSYS_NO_PATHCONV=1
cd "$(dirname "$0")"
REGION="${AWS_REGION:-ap-south-1}"
FN=zora-play-joke
ROLE=zora-play-joke-role
API=zora-play-joke-api
GUARDRAIL_ID="${GUARDRAIL_ID:?set GUARDRAIL_ID}"
GUARDRAIL_VERSION="${GUARDRAIL_VERSION:-1}"
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)

# 1. role
if ! aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  aws iam create-role --role-name "$ROLE" --description "Zora Play live joke Lambda" --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null
  aws iam attach-role-policy --role-name "$ROLE" --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
  NEW_ROLE=1
fi
aws iam put-role-policy --role-name "$ROLE" --policy-name zora-play-joke-access --policy-document "{
  \"Version\":\"2012-10-17\",\"Statement\":[
    {\"Effect\":\"Allow\",\"Action\":[\"bedrock:InvokeModel\"],\"Resource\":[\"arn:aws:bedrock:*::foundation-model/amazon.nova-lite-v1:0\",\"arn:aws:bedrock:*::foundation-model/amazon.nova-pro-v1:0\",\"arn:aws:bedrock:*:${ACCOUNT}:inference-profile/apac.amazon.nova-lite-v1:0\",\"arn:aws:bedrock:*:${ACCOUNT}:inference-profile/apac.amazon.nova-pro-v1:0\"]},
    {\"Effect\":\"Allow\",\"Action\":[\"bedrock:ApplyGuardrail\"],\"Resource\":\"arn:aws:bedrock:${REGION}:${ACCOUNT}:guardrail/${GUARDRAIL_ID}\"},
    {\"Effect\":\"Allow\",\"Action\":[\"polly:SynthesizeSpeech\"],\"Resource\":\"*\"}
  ]}"
[ -n "${NEW_ROLE:-}" ] && sleep 12
ROLE_ARN="arn:aws:iam::${ACCOUNT}:role/${ROLE}"

# 2. code
python - <<'PY'
import zipfile
with zipfile.ZipFile('function.zip', 'w', zipfile.ZIP_DEFLATED) as z:
    z.write('index.mjs')
    z.write('rules.mjs')
PY
ENVV="Variables={GUARDRAIL_ID=${GUARDRAIL_ID},GUARDRAIL_VERSION=${GUARDRAIL_VERSION},MODEL_ID=${MODEL_ID:-apac.amazon.nova-pro-v1:0},BEDROCK_REGION=${REGION},POLLY_REGION=us-east-1}"
if aws lambda get-function --function-name "$FN" --region "$REGION" >/dev/null 2>&1; then
  aws lambda update-function-code --function-name "$FN" --zip-file fileb://function.zip --region "$REGION" >/dev/null
  aws lambda wait function-updated --function-name "$FN" --region "$REGION"
  aws lambda update-function-configuration --function-name "$FN" --environment "$ENVV" --timeout 25 --memory-size 512 --region "$REGION" >/dev/null
else
  aws lambda create-function --function-name "$FN" --runtime nodejs20.x --handler index.handler --role "$ROLE_ARN" --zip-file fileb://function.zip \
    --timeout 25 --memory-size 512 --environment "$ENVV" --description "Zora Play: one fresh kid-safe joke with voice" --region "$REGION" >/dev/null
fi
aws lambda wait function-active --function-name "$FN" --region "$REGION"
# cost guard: at most 5 jokes being made at the same time
aws lambda put-function-concurrency --function-name "$FN" --reserved-concurrent-executions 5 --region "$REGION" >/dev/null 2>&1 || echo "note: could not set reserved concurrency (account limit); rely on API throttling"

# 3. HTTP API and throttling. CORS headers come from the Lambda itself: the API gateway CORS setting does not answer the app origin (file:// pages send "Origin: null"), so it is left off.
API_ID=$(aws apigatewayv2 get-apis --region "$REGION" --query "Items[?Name=='${API}'].ApiId | [0]" --output text)
if [ "$API_ID" = "None" ] || [ -z "$API_ID" ]; then
  FN_ARN="arn:aws:lambda:${REGION}:${ACCOUNT}:function:${FN}"
  API_ID=$(aws apigatewayv2 create-api --name "$API" --protocol-type HTTP --target "$FN_ARN" \
    --region "$REGION" --query ApiId --output text)
  aws lambda add-permission --function-name "$FN" --statement-id zora-play-apigw --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT}:${API_ID}/*" --region "$REGION" >/dev/null
fi
aws apigatewayv2 update-stage --api-id "$API_ID" --stage-name '$default' \
  --default-route-settings ThrottlingBurstLimit=5,ThrottlingRateLimit=2 --region "$REGION" >/dev/null
echo "ENDPOINT=https://${API_ID}.execute-api.${REGION}.amazonaws.com/"
