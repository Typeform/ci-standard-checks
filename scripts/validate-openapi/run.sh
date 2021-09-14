#!/bin/bash

# exit when any command fails
set -e

if ! command -v "jq" &> /dev/null
then
    echo "Unable to find jq. Is it installed and added to your \$PATH?"
    exit 1
fi

pull_number=$(jq --raw-output .pull_request.number "$GITHUB_EVENT_PATH")
PR_URL="$GITHUB_API_URL/repos/$GITHUB_REPOSITORY/pulls/$pull_number/files"
echo "Retrieving PR#$pull_number files info from ${PR_URL}"

curl -s -H "Authorization: Bearer ${GITHUBTOKEN}" $PR_URL | tee  test.json
MODIFIED_API=$(cat test.json |jq '.[] | select(.filename == "openapi.yaml")' | wc -m)
echo $MODIFIED_API

if [ $MODIFIED_API -eq 0 ]; then
  echo "Skipping OpenAPI validation."
  exit 0
fi

if ! command -v "npm" &> /dev/null
then
    echo "Unable to find npm. Is it installed and added to your \$PATH?"
    exit 1
fi

npm install -g @apidevtools/swagger-cli @redocly/openapi-cli

openapi bundle --dereferenced openapi.yaml > openapi.der.yaml

swagger-cli validate openapi.yaml

swagger-cli validate openapi.der.yaml

openapi lint openapi.yaml openapi.der.yaml
