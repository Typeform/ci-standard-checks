#!/bin/bash

# exit when any command fails
set -e

if ! command -v "jq" &> /dev/null
then
    echo "Unable to find jq. Is it installed and added to your \$PATH?"
    exit 1
fi

if [ -z "${INPUT_GITHUBTOKEN}" ]; then
  echo "::error:: GitHub token is empty"
  exit 1
fi

pull_number=$(jq --raw-output .pull_request.number "$GITHUB_EVENT_PATH")
PR_URL="$GITHUB_API_URL/repos/$GITHUB_REPOSITORY/pulls/$pull_number/files"
echo "Retrieving PR#$pull_number files info from ${PR_URL}"

AUTH_HEADER="Authorization: Bearer ${INPUT_GITHUBTOKEN}"
MODIFIED_API=$(curl -f -s -H "$AUTH_HEADER" "$PR_URL" | jq '.[] | select(.filename == "openapi.yaml")' | wc -m)

if [ $MODIFIED_API -eq 0 ]; then
  echo "Skipping OpenAPI validation."
  exit 0
fi

if ! command -v "npx" &> /dev/null
then
    echo "::error:: Unable to find npx. Are you using npm with version >= 5.2.0 ?"
    exit 1
fi

npx @redocly/openapi-cli bundle --dereferenced openapi.yaml > openapi.der.yaml

npx @apidevtools/swagger-cli validate openapi.yaml

npx @apidevtools/swagger-cli validate openapi.der.yaml

npx @redocly/openapi-cli lint openapi.yaml openapi.der.yaml
